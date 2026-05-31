-- Update the claim_agency_withdrawal function to allow 1-hour locks
CREATE OR REPLACE FUNCTION public.claim_agency_withdrawal(
  _withdrawal_id uuid,
  _helper_id uuid,
  _lock_seconds integer DEFAULT 3600
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _current public.agency_withdrawals%ROWTYPE;
  _helper public.topup_helpers%ROWTYPE;
  -- Allow up to 1 hour (3600 seconds), default to 1 hour if not provided
  _effective_lock_seconds integer := LEAST(GREATEST(COALESCE(_lock_seconds, 3600), 10), 3600);
  _lock_until timestamptz := now() + make_interval(secs => _effective_lock_seconds);
  _withdrawal_country text;
BEGIN
  -- Verify helper exists and is eligible
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

  -- Lock the row for update to prevent concurrent claims
  SELECT * INTO _current
  FROM public.agency_withdrawals
  WHERE id = _withdrawal_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Withdrawal not found');
  END IF;

  -- Check if already processed or reversed
  IF _current.status <> 'pending' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Withdrawal is no longer available');
  END IF;

  -- Check processability
  IF COALESCE(_current.payment_method, '') IN ('epay', 'crypto_auto') THEN
    RETURN jsonb_build_object('success', false, 'error', 'This withdrawal is not helper-processable');
  END IF;

  -- Check country matching
  _withdrawal_country := COALESCE(_current.country_code, _current.payment_details->>'country_code');
  IF _withdrawal_country IS NULL OR btrim(_withdrawal_country) = '' OR _helper.country_code IS DISTINCT FROM _withdrawal_country THEN
    RETURN jsonb_build_object('success', false, 'error', 'Withdrawal is outside your country');
  END IF;

  -- Check existing active lock by another helper
  IF _current.assigned_helper_id IS NOT NULL
     AND _current.assigned_helper_id <> _helper_id
     AND _current.claim_locked_until IS NOT NULL
     AND _current.claim_locked_until > now() THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Already claimed by another helper',
      'claim_locked_until', _current.claim_locked_until,
      'assigned_helper_id', _current.assigned_helper_id
    );
  END IF;

  -- Apply or renew the lock
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
