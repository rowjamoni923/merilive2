-- =========================================================
-- Pkg332 pass-2: agency withdrawal -> L5 helper deep hardening
-- =========================================================

-- 1) Stop leaking helper user_id + wallet_balance from helper discovery.
-- Keep the historical signature for compatibility, but only return non-sensitive
-- routing fields and require an authenticated caller.
CREATE OR REPLACE FUNCTION public.find_available_helper(user_country text DEFAULT 'BD'::text)
RETURNS TABLE(helper_id uuid, user_id uuid, wallet_balance numeric, country_code text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_country text := upper(left(regexp_replace(coalesce(user_country, 'BD'), '[^A-Za-z]', '', 'g'), 8));
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  IF v_country = '' THEN
    v_country := 'BD';
  END IF;

  RETURN QUERY
  SELECT
    th.id AS helper_id,
    NULL::uuid AS user_id,
    0::numeric AS wallet_balance,
    th.country_code
  FROM public.topup_helpers th
  WHERE th.is_active = true
    AND th.is_verified = true
    AND th.wallet_balance > 0
    AND (
      th.country_code = v_country
      OR v_country = ANY(coalesce(th.supported_countries, ARRAY[]::text[]))
    )
  ORDER BY CASE WHEN th.country_code = v_country THEN 0 ELSE 1 END, th.created_at ASC
  LIMIT 10;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.find_available_helper(text) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.find_available_helper(text) TO authenticated;

-- 2) Remove dead/parallel completion path. The live UI uses
-- helper_process_agency_withdrawal + admin_process_withdrawal; keeping this
-- unused function granted to authenticated helpers only adds attack surface.
DROP FUNCTION IF EXISTS public.complete_agency_withdrawal(uuid, jsonb);

-- 3) Guard agency_withdrawals status transitions and helper assignment.
CREATE OR REPLACE FUNCTION public.guard_agency_withdrawals_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status IS NULL OR NEW.status NOT IN ('pending', 'processing', 'completed', 'approved', 'rejected') THEN
    RAISE EXCEPTION 'Invalid agency withdrawal status' USING ERRCODE = '23514';
  END IF;

  IF OLD.status IS DISTINCT FROM NEW.status THEN
    IF OLD.status = 'pending' AND NEW.status IN ('processing', 'approved', 'rejected') THEN
      NULL;
    ELSIF OLD.status = 'processing' AND NEW.status IN ('pending', 'completed', 'approved') THEN
      NULL;
    ELSIF OLD.status = 'completed' AND NEW.status = 'approved' THEN
      NULL;
    ELSE
      RAISE EXCEPTION 'Invalid agency withdrawal status transition: % -> %', OLD.status, NEW.status
        USING ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.assigned_helper_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.topup_helpers th
    WHERE th.id = NEW.assigned_helper_id
      AND th.trader_level = 5
      AND th.payroll_enabled = true
      AND th.is_active = true
      AND th.is_verified = true
      AND th.country_code = COALESCE(NEW.country_code, NEW.payment_details->>'country_code')
  ) THEN
    RAISE EXCEPTION 'Assigned helper is not an active verified payroll Level 5 helper for this country'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.helper_diamonds_credited = true AND NEW.status <> 'approved' THEN
    RAISE EXCEPTION 'Helper reward can only be marked credited on approved withdrawals'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.net_diamonds_to_helper IS NOT NULL AND NEW.net_diamonds_to_helper < 0 THEN
    RAISE EXCEPTION 'Helper diamond reward cannot be negative' USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_guard_agency_withdrawals_update ON public.agency_withdrawals;
CREATE TRIGGER trg_guard_agency_withdrawals_update
BEFORE UPDATE ON public.agency_withdrawals
FOR EACH ROW
EXECUTE FUNCTION public.guard_agency_withdrawals_update();

-- 4) Harden the only live helper processing path. Proof must be a private
-- payment-proofs object under the authenticated helper user's folder, not an
-- arbitrary URL supplied by the browser.
CREATE OR REPLACE FUNCTION public.helper_process_agency_withdrawal(
  _withdrawal_id uuid,
  _helper_id uuid,
  _screenshot_url text,
  _transaction_id text,
  _notes text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _current record;
  _helper public.topup_helpers%ROWTYPE;
  _payment_details jsonb;
  _proof jsonb;
  _safe_tx text;
  _safe_tx_key text;
  _safe_notes text;
  _safe_screenshot text;
  _expected_prefix text;
  _helper_rate numeric;
  _diamond_reward bigint;
  _withdrawal_country text;
BEGIN
  _safe_screenshot := trim(COALESCE(_screenshot_url, ''));
  _expected_prefix := 'payment-proofs/' || auth.uid()::text || '/';

  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Authentication required');
  END IF;

  IF _safe_screenshot = '' OR length(_safe_screenshot) > 500 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Payment screenshot is required');
  END IF;

  IF left(_safe_screenshot, length(_expected_prefix)) <> _expected_prefix THEN
    RETURN jsonb_build_object('success', false, 'error', 'Payment screenshot must be uploaded to your private payment proof folder');
  END IF;

  _safe_tx := trim(COALESCE(_transaction_id, ''));
  IF length(_safe_tx) < 4 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Transaction ID must be at least 4 characters');
  END IF;
  _safe_tx := left(_safe_tx, 120);
  _safe_tx_key := lower(_safe_tx);
  _safe_notes := NULLIF(left(trim(COALESCE(_notes, '')), 500), '');

  SELECT * INTO _helper
  FROM public.topup_helpers th
  WHERE th.id = _helper_id
    AND th.user_id = auth.uid()
    AND th.trader_level = 5
    AND th.payroll_enabled = true
    AND th.is_active = true
    AND th.is_verified = true;

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

  IF _current.status NOT IN ('pending', 'processing') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Withdrawal already finalized');
  END IF;

  IF COALESCE(_current.payment_method, '') IN ('epay', 'crypto_auto') THEN
    RETURN jsonb_build_object('success', false, 'error', 'This withdrawal is not helper-processable');
  END IF;

  _withdrawal_country := COALESCE(_current.country_code, _current.payment_details->>'country_code');
  IF _withdrawal_country IS NULL OR btrim(_withdrawal_country) = '' OR _helper.country_code IS DISTINCT FROM _withdrawal_country THEN
    RETURN jsonb_build_object('success', false, 'error', 'Withdrawal is outside your country');
  END IF;

  IF _current.assigned_helper_id IS NOT NULL
     AND _current.assigned_helper_id <> _helper_id
     AND _current.claim_locked_until IS NOT NULL
     AND _current.claim_locked_until > now() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Withdrawal is locked by another helper');
  END IF;

  IF _current.status = 'processing' AND _current.assigned_helper_id IS DISTINCT FROM _helper_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Withdrawal already assigned to another helper');
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.agency_withdrawals aw
    WHERE aw.id <> _withdrawal_id
      AND aw.status IN ('processing', 'completed', 'approved')
      AND lower(NULLIF(aw.helper_proof->>'helper_transaction_id', '')) = _safe_tx_key
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Duplicate transaction ID');
  END IF;

  SELECT NULLIF(setting_value->>'rate','')::numeric INTO _helper_rate
  FROM public.app_settings
  WHERE setting_key = 'helper_diamond_commission';

  IF _helper_rate IS NULL OR _helper_rate < 0 OR _helper_rate > 100 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Helper diamond commission rate not configured. Ask admin to set it in Pricing Hub.');
  END IF;

  _diamond_reward := FLOOR(COALESCE(_current.amount, 0) * _helper_rate / 100.0)::bigint;

  _proof := jsonb_build_object(
    'helper_payment_screenshot', _safe_screenshot,
    'helper_transaction_id',     _safe_tx,
    'helper_notes',              _safe_notes,
    'diamond_reward',            _diamond_reward,
    'helper_rate_percent',       _helper_rate,
    'helper_processed_at',       now(),
    'processed_by_helper_id',    _helper_id,
    'helper_country_code',       _helper.country_code
  );

  _payment_details := COALESCE(_current.payment_details, '{}'::jsonb) || _proof;

  UPDATE public.agency_withdrawals
  SET status                  = 'processing',
      assigned_helper_id      = _helper_id,
      claim_locked_until      = NULL,
      helper_processed_at     = now(),
      helper_proof            = _proof,
      payment_details         = _payment_details,
      net_diamonds_to_helper  = _diamond_reward,
      fee_percentage          = _helper_rate,
      updated_at              = now()
  WHERE id = _withdrawal_id;

  BEGIN
    DELETE FROM public.agency_withdrawal_locks WHERE withdrawal_id = _withdrawal_id;
  EXCEPTION WHEN undefined_table THEN
    NULL;
  END;

  RETURN jsonb_build_object(
    'success', true,
    'withdrawal_id', _withdrawal_id,
    'diamond_reward', _diamond_reward,
    'helper_rate_percent', _helper_rate
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.helper_process_agency_withdrawal(uuid, uuid, text, text, text) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.helper_process_agency_withdrawal(uuid, uuid, text, text, text) TO authenticated;