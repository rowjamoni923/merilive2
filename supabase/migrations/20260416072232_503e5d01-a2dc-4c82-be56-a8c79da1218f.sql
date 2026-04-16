ALTER TABLE public.agency_withdrawals
ADD COLUMN IF NOT EXISTS claim_locked_until TIMESTAMP WITH TIME ZONE;

CREATE INDEX IF NOT EXISTS idx_agency_withdrawals_claim_locked_until
ON public.agency_withdrawals (claim_locked_until)
WHERE status = 'pending';

CREATE OR REPLACE FUNCTION public.claim_agency_withdrawal(
  _withdrawal_id uuid,
  _helper_id uuid,
  _lock_seconds integer DEFAULT 30
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _current public.agency_withdrawals%ROWTYPE;
  _helper public.topup_helpers%ROWTYPE;
  _effective_lock_seconds integer := LEAST(GREATEST(COALESCE(_lock_seconds, 30), 10), 30);
  _lock_until timestamptz := now() + make_interval(secs => _effective_lock_seconds);
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

  IF _current.assigned_helper_id IS NOT NULL
     AND _current.assigned_helper_id <> _helper_id
     AND _current.claim_locked_until IS NOT NULL
     AND _current.claim_locked_until > now() THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Already claimed',
      'claim_locked_until', _current.claim_locked_until,
      'assigned_helper_id', _current.assigned_helper_id
    );
  END IF;

  UPDATE public.agency_withdrawals
  SET assigned_helper_id = _helper_id,
      claim_locked_until = _lock_until
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
      claim_locked_until = NULL
  WHERE id = _withdrawal_id
    AND status = 'pending'
    AND assigned_helper_id = _helper_id;

  RETURN jsonb_build_object('success', true, 'released', FOUND);
END;
$$;

GRANT EXECUTE ON FUNCTION public.release_agency_withdrawal_claim(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.helper_process_agency_withdrawal(
  _withdrawal_id uuid,
  _helper_id uuid,
  _screenshot_url text,
  _transaction_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _current record;
  _payment_details jsonb;
  _net_withdrawal_beans numeric;
  _diamond_reward numeric;
BEGIN
  SELECT * INTO _current
  FROM public.agency_withdrawals
  WHERE id = _withdrawal_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Withdrawal not found');
  END IF;

  IF _current.status <> 'pending' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Withdrawal already claimed or processed');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.topup_helpers th
    WHERE th.id = _helper_id
      AND th.user_id = auth.uid()
      AND th.trader_level = 5
      AND th.payroll_enabled = true
      AND th.is_active = true
      AND th.is_verified = true
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized helper');
  END IF;

  IF _current.assigned_helper_id IS NOT NULL
     AND _current.assigned_helper_id <> _helper_id
     AND _current.claim_locked_until IS NOT NULL
     AND _current.claim_locked_until > now() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Withdrawal is locked by another helper');
  END IF;

  _net_withdrawal_beans := COALESCE((_current.payment_details->>'net_withdrawal_beans')::numeric, _current.amount);
  _diamond_reward := ROUND(_net_withdrawal_beans);
  _payment_details := COALESCE(_current.payment_details, '{}'::jsonb) || jsonb_build_object(
    'helper_payment_screenshot', _screenshot_url,
    'helper_transaction_id', _transaction_note,
    'helper_notes', _transaction_note,
    'diamond_reward', _diamond_reward,
    'helper_processed_at', now(),
    'processed_by_helper_id', _helper_id
  );

  UPDATE public.agency_withdrawals
  SET status = 'processing',
      assigned_helper_id = _helper_id,
      claim_locked_until = NULL,
      helper_processed_at = now(),
      payment_details = _payment_details
  WHERE id = _withdrawal_id;

  RETURN jsonb_build_object(
    'success', true,
    'withdrawal_id', _withdrawal_id,
    'diamond_reward', _diamond_reward
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.helper_process_agency_withdrawal(uuid, uuid, text, text) TO authenticated;