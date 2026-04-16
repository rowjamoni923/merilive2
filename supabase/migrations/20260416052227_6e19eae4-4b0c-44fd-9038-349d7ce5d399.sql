CREATE OR REPLACE FUNCTION public.request_agency_withdrawal(
  _agency_id uuid,
  _amount numeric,
  _payment_method text DEFAULT 'bank_transfer',
  _payment_details jsonb DEFAULT '{}'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _current_balance numeric;
  _withdrawal_id uuid;
  _platform_fee numeric;
  _net_amount numeric;
BEGIN
  SELECT COALESCE(wallet_balance, 0)
  INTO _current_balance
  FROM public.agencies
  WHERE id = _agency_id;

  IF _current_balance IS NULL OR _current_balance < _amount THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient balance');
  END IF;

  _platform_fee := ROUND(_amount * 0.05, 0);
  _net_amount := _amount - _platform_fee;

  UPDATE public.agencies
  SET wallet_balance = COALESCE(wallet_balance, 0) - _amount,
      updated_at = now()
  WHERE id = _agency_id;

  INSERT INTO public.agency_withdrawals (agency_id, amount, payment_method, payment_details, status)
  VALUES (
    _agency_id,
    _amount,
    _payment_method,
    COALESCE(_payment_details, '{}'::jsonb) || jsonb_build_object(
      'platform_fee', _platform_fee,
      'net_withdrawal_beans', _net_amount,
      'source_balance_bucket', 'wallet_balance'
    ),
    'pending'
  )
  RETURNING id INTO _withdrawal_id;

  RETURN jsonb_build_object('success', true, 'withdrawal_id', _withdrawal_id, 'amount', _amount, 'fee', _platform_fee, 'net', _net_amount);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_process_withdrawal(_withdrawal_id uuid, _status text, _notes text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _withdrawal RECORD;
  _diamond_reward NUMERIC;
  _platform_fee NUMERIC;
  _net_reward NUMERIC;
  _net_beans NUMERIC;
  _helper_user_id UUID;
  _agency_owner_id UUID;
  _is_payroll_helper BOOLEAN;
  _refund_bucket TEXT;
BEGIN
  SELECT aw.* INTO _withdrawal FROM public.agency_withdrawals aw WHERE aw.id = _withdrawal_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'Withdrawal not found'); END IF;
  IF _withdrawal.status NOT IN ('pending', 'processing') THEN RETURN jsonb_build_object('success', false, 'error', 'Invalid status transition'); END IF;

  IF _status = 'approved' THEN
    _net_beans := _withdrawal.amount - COALESCE((_withdrawal.payment_details->>'platform_fee')::NUMERIC, ROUND(_withdrawal.amount * 0.05, 0));
    UPDATE public.agency_withdrawals
    SET status = _status,
        notes = _notes,
        processed_at = NOW(),
        payment_details = COALESCE(payment_details, '{}'::jsonb) || jsonb_build_object('approved_at', NOW(), 'net_withdrawal_beans', _net_beans)
    WHERE id = _withdrawal_id;

    SELECT a.owner_id INTO _agency_owner_id FROM public.agencies a WHERE a.id = _withdrawal.agency_id;
    SELECT EXISTS(
      SELECT 1
      FROM public.topup_helpers th
      WHERE th.user_id = _agency_owner_id
        AND th.is_verified = true
        AND th.payroll_enabled = true
    ) INTO _is_payroll_helper;

    IF NOT _is_payroll_helper THEN
      UPDATE public.agencies
      SET commission_rate = 3,
          level = 'A1',
          updated_at = NOW()
      WHERE id = _withdrawal.agency_id;
    END IF;

    IF _withdrawal.assigned_helper_id IS NOT NULL AND _net_beans > 0 THEN
      _diamond_reward := _net_beans;
      _platform_fee := ROUND(_diamond_reward * 0.10, 2);
      _net_reward := _diamond_reward - _platform_fee;
      SELECT user_id INTO _helper_user_id FROM public.topup_helpers WHERE id = _withdrawal.assigned_helper_id;
      IF _helper_user_id IS NOT NULL THEN
        UPDATE public.topup_helpers
        SET wallet_balance = COALESCE(wallet_balance, 0) + _net_reward
        WHERE id = _withdrawal.assigned_helper_id;

        INSERT INTO public.notifications (user_id, type, title, message, data)
        VALUES (
          _helper_user_id,
          'withdrawal_reward',
          'Diamond Reward!',
          'You received ' || ROUND(_net_reward)::TEXT || ' diamonds',
          jsonb_build_object('withdrawal_id', _withdrawal_id, 'net_reward', _net_reward)
        );
      END IF;
    END IF;

    RETURN jsonb_build_object('success', true, 'message', 'Withdrawal approved');
  ELSE
    UPDATE public.agency_withdrawals
    SET status = _status,
        notes = _notes,
        processed_at = NOW()
    WHERE id = _withdrawal_id;

    IF _status = 'rejected' THEN
      _refund_bucket := COALESCE(_withdrawal.payment_details->>'source_balance_bucket', 'wallet_balance');

      IF _refund_bucket = 'beans_balance' THEN
        UPDATE public.agencies
        SET beans_balance = COALESCE(beans_balance, 0) + _withdrawal.amount,
            updated_at = NOW()
        WHERE id = _withdrawal.agency_id;
      ELSE
        UPDATE public.agencies
        SET wallet_balance = COALESCE(wallet_balance, 0) + _withdrawal.amount,
            updated_at = NOW()
        WHERE id = _withdrawal.agency_id;
      END IF;

      SELECT a.owner_id INTO _agency_owner_id FROM public.agencies a WHERE a.id = _withdrawal.agency_id;
      IF _agency_owner_id IS NOT NULL THEN
        INSERT INTO public.notifications (user_id, type, title, message, data)
        VALUES (
          _agency_owner_id,
          'withdrawal_rejected',
          '❌ Withdrawal Rejected',
          'Your withdrawal of ' || _withdrawal.amount::TEXT || ' beans has been refunded.',
          jsonb_build_object('withdrawal_id', _withdrawal_id, 'amount', _withdrawal.amount, 'notes', _notes, 'refund_bucket', _refund_bucket)
        );
      END IF;
    END IF;

    RETURN jsonb_build_object('success', true, 'message', 'Withdrawal ' || _status);
  END IF;
END;
$$;

DO $$
DECLARE
  v_agency_id uuid;
  v_stuck_beans numeric := 0;
  v_rejected_total numeric := 0;
  v_transfer_rows integer := 0;
  v_active_hosts integer := 0;
BEGIN
  SELECT a.id, COALESCE(a.beans_balance, 0)
  INTO v_agency_id, v_stuck_beans
  FROM public.agencies a
  WHERE a.agency_code = 'AGVB7D42'
  LIMIT 1;

  IF v_agency_id IS NOT NULL THEN
    SELECT COALESCE(SUM(amount), 0)
    INTO v_rejected_total
    FROM public.agency_withdrawals
    WHERE agency_id = v_agency_id
      AND status = 'rejected';

    SELECT COUNT(*)
    INTO v_transfer_rows
    FROM public.agency_earnings_transfers
    WHERE agency_id = v_agency_id;

    SELECT COUNT(*)
    INTO v_active_hosts
    FROM public.agency_hosts
    WHERE agency_id = v_agency_id
      AND status = 'active';

    IF v_stuck_beans > 0
       AND v_stuck_beans = v_rejected_total
       AND v_transfer_rows = 0
       AND v_active_hosts = 0 THEN
      UPDATE public.agencies
      SET wallet_balance = COALESCE(wallet_balance, 0) + v_stuck_beans,
          beans_balance = 0,
          updated_at = now()
      WHERE id = v_agency_id;

      UPDATE public.agency_withdrawals
      SET payment_details = COALESCE(payment_details, '{}'::jsonb) || jsonb_build_object(
        'source_balance_bucket', 'wallet_balance',
        'legacy_repair_applied', true,
        'legacy_repair_at', now(),
        'legacy_repair_reason', 'rejected_withdrawal_balance_split'
      )
      WHERE agency_id = v_agency_id
        AND status = 'rejected';
    END IF;
  END IF;
END;
$$;