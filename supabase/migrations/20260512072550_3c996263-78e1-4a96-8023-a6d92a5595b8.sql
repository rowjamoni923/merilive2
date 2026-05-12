-- Drop existing 4-arg version and replace with hardened version that takes separate transaction_id and notes
DROP FUNCTION IF EXISTS public.helper_process_agency_withdrawal(uuid, uuid, text, text);

CREATE OR REPLACE FUNCTION public.helper_process_agency_withdrawal(
  _withdrawal_id uuid,
  _helper_id uuid,
  _screenshot_url text,
  _transaction_id text,
  _notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _current record;
  _payment_details jsonb;
  _net_withdrawal_beans numeric;
  _diamond_reward numeric;
  _safe_tx text;
  _safe_notes text;
BEGIN
  -- Validate inputs
  IF _screenshot_url IS NULL OR length(trim(_screenshot_url)) = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Payment screenshot is required');
  END IF;

  _safe_tx := trim(COALESCE(_transaction_id, ''));
  IF length(_safe_tx) < 4 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Transaction ID must be at least 4 characters');
  END IF;
  _safe_tx := left(_safe_tx, 120);
  _safe_notes := NULLIF(left(trim(COALESCE(_notes, '')), 500), '');

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
    'helper_transaction_id', _safe_tx,
    'helper_notes', _safe_notes,
    'diamond_reward', _diamond_reward,
    'helper_processed_at', now(),
    'processed_by_helper_id', _helper_id
  );

  UPDATE public.agency_withdrawals
  SET status = 'processing',
      assigned_helper_id = _helper_id,
      claim_locked_until = NULL,
      helper_processed_at = now(),
      helper_payment_screenshot = _screenshot_url,
      helper_transaction_id = _safe_tx,
      helper_notes = _safe_notes,
      payment_details = _payment_details
  WHERE id = _withdrawal_id;

  RETURN jsonb_build_object(
    'success', true,
    'withdrawal_id', _withdrawal_id,
    'diamond_reward', _diamond_reward
  );
END;
$function$;
