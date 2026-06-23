
-- 1) Add blocked_helper_ids to track helpers that already had a chance and released
ALTER TABLE public.agency_withdrawals
  ADD COLUMN IF NOT EXISTS blocked_helper_ids uuid[] NOT NULL DEFAULT '{}'::uuid[];

CREATE INDEX IF NOT EXISTS idx_agency_withdrawals_blocked_helpers
  ON public.agency_withdrawals USING gin (blocked_helper_ids);

CREATE INDEX IF NOT EXISTS idx_agency_withdrawals_country_status
  ON public.agency_withdrawals (country_code, status);

-- 2) DB-level country isolation trigger: a withdrawal can only be assigned to
--    a helper whose country_code matches the withdrawal's country.
CREATE OR REPLACE FUNCTION public.enforce_agency_withdrawal_country()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _wcountry text;
  _hcountry text;
BEGIN
  IF NEW.assigned_helper_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
     AND NEW.assigned_helper_id IS NOT DISTINCT FROM OLD.assigned_helper_id THEN
    RETURN NEW;
  END IF;

  _wcountry := COALESCE(NEW.country_code, NEW.payment_details->>'country_code');
  IF _wcountry IS NULL OR btrim(_wcountry) = '' THEN
    RAISE EXCEPTION 'Withdrawal % has no country_code; cannot assign helper', NEW.id
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT country_code INTO _hcountry
  FROM public.topup_helpers
  WHERE id = NEW.assigned_helper_id;

  IF _hcountry IS NULL OR btrim(_hcountry) = '' OR _hcountry IS DISTINCT FROM _wcountry THEN
    RAISE EXCEPTION 'Country mismatch: withdrawal=% helper=% (helper not allowed to claim cross-country withdrawal)',
      _wcountry, COALESCE(_hcountry,'<none>')
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_agency_withdrawal_country ON public.agency_withdrawals;
CREATE TRIGGER trg_enforce_agency_withdrawal_country
BEFORE INSERT OR UPDATE OF assigned_helper_id, country_code
ON public.agency_withdrawals
FOR EACH ROW
EXECUTE FUNCTION public.enforce_agency_withdrawal_country();

-- 3) Updated claim function:
--    - 30 minute lock (default 1800s, max 1800s)
--    - blocks helpers in blocked_helper_ids
--    - rejects if any active cooldown lock exists (even if assigned_helper_id cleared)
--    - enforces country
CREATE OR REPLACE FUNCTION public.claim_agency_withdrawal(
  _withdrawal_id uuid,
  _helper_id uuid,
  _lock_seconds integer DEFAULT 1800
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _current public.agency_withdrawals%ROWTYPE;
  _helper public.topup_helpers%ROWTYPE;
  _effective_lock_seconds integer := LEAST(GREATEST(COALESCE(_lock_seconds, 1800), 60), 1800);
  _lock_until timestamptz := now() + make_interval(secs => _effective_lock_seconds);
  _withdrawal_country text;
BEGIN
  SELECT * INTO _helper
  FROM public.topup_helpers
  WHERE id = _helper_id
    AND user_id = auth.uid()
    AND trader_level = 5
    AND payroll_enabled = true
    AND is_active = true
    AND is_verified = true;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized helper');
  END IF;

  SELECT * INTO _current
  FROM public.agency_withdrawals
  WHERE id = _withdrawal_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Withdrawal not found');
  END IF;

  IF _current.status <> 'pending' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Withdrawal is no longer available');
  END IF;

  IF COALESCE(_current.payment_method, '') IN ('epay', 'crypto_auto') THEN
    RETURN jsonb_build_object('success', false, 'error', 'This withdrawal is not helper-processable');
  END IF;

  -- Country isolation
  _withdrawal_country := COALESCE(_current.country_code, _current.payment_details->>'country_code');
  IF _withdrawal_country IS NULL OR btrim(_withdrawal_country) = ''
     OR _helper.country_code IS DISTINCT FROM _withdrawal_country THEN
    RETURN jsonb_build_object('success', false, 'error', 'Withdrawal is outside your country');
  END IF;

  -- Permanently blocked helper for this withdrawal (previously claimed & released)
  IF _helper_id = ANY (COALESCE(_current.blocked_helper_ids, '{}'::uuid[])) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'You released this withdrawal earlier and cannot claim it again'
    );
  END IF;

  -- Any active lock (even with no assignee = cooldown after release) blocks others
  IF _current.claim_locked_until IS NOT NULL
     AND _current.claim_locked_until > now()
     AND _current.assigned_helper_id IS DISTINCT FROM _helper_id THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', CASE
        WHEN _current.assigned_helper_id IS NULL THEN 'Withdrawal is in cooldown, try again later'
        ELSE 'Already claimed by another helper'
      END,
      'claim_locked_until', _current.claim_locked_until,
      'assigned_helper_id', _current.assigned_helper_id
    );
  END IF;

  UPDATE public.agency_withdrawals
  SET assigned_helper_id = _helper_id,
      claim_locked_until = _lock_until,
      updated_at = now()
  WHERE id = _withdrawal_id;

  RETURN jsonb_build_object(
    'success', true,
    'withdrawal_id', _withdrawal_id,
    'assigned_helper_id', _helper_id,
    'claim_locked_until', _lock_until
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_agency_withdrawal(uuid, uuid, integer) TO authenticated;

-- 4) Updated release: append helper to blocked list, keep claim_locked_until as
--    cooldown so other helpers also cannot claim until original 30 min expires.
CREATE OR REPLACE FUNCTION public.release_agency_withdrawal_claim(
  _withdrawal_id uuid,
  _helper_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _helper public.topup_helpers%ROWTYPE;
  _released boolean := false;
BEGIN
  SELECT * INTO _helper
  FROM public.topup_helpers
  WHERE id = _helper_id
    AND user_id = auth.uid()
    AND trader_level = 5
    AND payroll_enabled = true
    AND is_active = true
    AND is_verified = true;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized helper');
  END IF;

  UPDATE public.agency_withdrawals
  SET assigned_helper_id = NULL,
      blocked_helper_ids = (
        SELECT ARRAY(SELECT DISTINCT unnest(COALESCE(blocked_helper_ids, '{}'::uuid[]) || ARRAY[_helper_id]))
      ),
      updated_at = now()
      -- Intentionally KEEP claim_locked_until so the 30-min cooldown applies to others
  WHERE id = _withdrawal_id
    AND status = 'pending'
    AND assigned_helper_id = _helper_id;

  _released := FOUND;

  RETURN jsonb_build_object('success', true, 'released', _released);
END;
$$;

GRANT EXECUTE ON FUNCTION public.release_agency_withdrawal_claim(uuid, uuid) TO authenticated;
