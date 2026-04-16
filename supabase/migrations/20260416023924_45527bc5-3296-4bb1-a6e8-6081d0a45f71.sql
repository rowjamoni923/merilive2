
CREATE OR REPLACE FUNCTION public.admin_process_withdrawal(_withdrawal_id uuid, _status text, _notes text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  _withdrawal RECORD;
  _diamond_reward NUMERIC;
  _platform_fee NUMERIC;
  _net_reward NUMERIC;
  _helper_user_id UUID;
  _net_beans NUMERIC;
  _agency_owner_id UUID;
  _is_payroll_helper BOOLEAN;
BEGIN
  SELECT aw.* INTO _withdrawal FROM agency_withdrawals aw WHERE aw.id = _withdrawal_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'Withdrawal not found'); END IF;
  IF _withdrawal.status NOT IN ('pending', 'processing') THEN RETURN jsonb_build_object('success', false, 'error', 'Invalid status transition'); END IF;

  IF _status = 'approved' THEN
    _net_beans := _withdrawal.amount - COALESCE((_withdrawal.payment_details->>'platform_fee')::NUMERIC, ROUND(_withdrawal.amount * 0.05, 0));
    UPDATE agency_withdrawals SET status = _status, notes = _notes, processed_at = NOW(),
      payment_details = COALESCE(payment_details, '{}'::jsonb) || jsonb_build_object('approved_at', NOW(), 'net_withdrawal_beans', _net_beans)
    WHERE id = _withdrawal_id;
    
    SELECT a.owner_id INTO _agency_owner_id FROM agencies a WHERE a.id = _withdrawal.agency_id;
    SELECT EXISTS(SELECT 1 FROM topup_helpers th WHERE th.user_id = _agency_owner_id AND th.is_verified = true AND th.payroll_enabled = true) INTO _is_payroll_helper;
    IF NOT _is_payroll_helper THEN
      UPDATE agencies SET commission_rate = 3, level = 'A1', updated_at = NOW() WHERE id = _withdrawal.agency_id;
    END IF;

    IF _withdrawal.assigned_helper_id IS NOT NULL AND _net_beans > 0 THEN
      _diamond_reward := _net_beans;
      _platform_fee := ROUND(_diamond_reward * 0.10, 2);
      _net_reward := _diamond_reward - _platform_fee;
      SELECT user_id INTO _helper_user_id FROM topup_helpers WHERE id = _withdrawal.assigned_helper_id;
      IF _helper_user_id IS NOT NULL THEN
        UPDATE topup_helpers SET wallet_balance = COALESCE(wallet_balance, 0) + _net_reward WHERE id = _withdrawal.assigned_helper_id;
        INSERT INTO notifications (user_id, type, title, message, data) VALUES (_helper_user_id, 'withdrawal_reward', 'Diamond Reward!', 'You received ' || ROUND(_net_reward)::TEXT || ' diamonds', jsonb_build_object('withdrawal_id', _withdrawal_id, 'net_reward', _net_reward));
      END IF;
    END IF;
    RETURN jsonb_build_object('success', true, 'message', 'Withdrawal approved');
  ELSE
    UPDATE agency_withdrawals SET status = _status, notes = _notes, processed_at = NOW() WHERE id = _withdrawal_id;
    IF _status = 'rejected' THEN
      -- CRITICAL FIX: Refund to wallet_balance (source of truth), NOT beans_balance
      UPDATE agencies SET wallet_balance = COALESCE(wallet_balance, 0) + _withdrawal.amount, updated_at = NOW() WHERE id = _withdrawal.agency_id;
      
      -- Also send rejection notification to agency owner
      SELECT a.owner_id INTO _agency_owner_id FROM agencies a WHERE a.id = _withdrawal.agency_id;
      IF _agency_owner_id IS NOT NULL THEN
        INSERT INTO notifications (user_id, type, title, message, data) VALUES (
          _agency_owner_id, 'withdrawal_rejected', '❌ Withdrawal Rejected',
          'Your withdrawal of ' || _withdrawal.amount::TEXT || ' beans has been rejected. Balance has been refunded.',
          jsonb_build_object('withdrawal_id', _withdrawal_id, 'amount', _withdrawal.amount, 'notes', _notes)
        );
      END IF;
    END IF;
    RETURN jsonb_build_object('success', true, 'message', 'Withdrawal ' || _status);
  END IF;
END;
$$;
