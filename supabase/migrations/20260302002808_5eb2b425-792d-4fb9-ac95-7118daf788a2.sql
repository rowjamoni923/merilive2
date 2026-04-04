
-- After withdrawal is approved, reset agency commission to 3% (A1 level)
-- EXCEPT if agency owner is a payroll helper
CREATE OR REPLACE FUNCTION public.admin_process_withdrawal(
  _withdrawal_id uuid,
  _status text,
  _notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _withdrawal RECORD;
  _helper_id UUID;
  _diamond_reward NUMERIC;
  _platform_fee NUMERIC;
  _net_reward NUMERIC;
  _helper_user_id UUID;
  _usd_amount NUMERIC;
  _net_beans NUMERIC;
  _agency_owner_id UUID;
  _is_payroll_helper BOOLEAN;
BEGIN
  SELECT 
    aw.*,
    COALESCE(
      (aw.payment_details->>'net_withdrawal_beans')::NUMERIC,
      aw.amount - COALESCE(aw.platform_fee_amount, 0)
    ) AS net_withdrawal_beans
  INTO _withdrawal 
  FROM agency_withdrawals aw
  WHERE aw.id = _withdrawal_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Withdrawal not found');
  END IF;

  IF _withdrawal.status NOT IN ('pending', 'processing') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid status transition');
  END IF;

  IF _status = 'approved' THEN
    _net_beans := COALESCE(
      (_withdrawal.payment_details->>'net_withdrawal_beans')::NUMERIC,
      _withdrawal.amount - COALESCE(
        (_withdrawal.payment_details->>'platform_fee')::NUMERIC,
        ROUND(_withdrawal.amount * 0.05, 0)
      )
    );

    UPDATE agency_withdrawals
    SET 
      status = _status,
      notes = _notes,
      processed_at = NOW(),
      payment_details = COALESCE(payment_details, '{}'::jsonb) || jsonb_build_object(
        'approved_at', NOW(),
        'net_withdrawal_beans', _net_beans
      )
    WHERE id = _withdrawal_id;
    
    -- After approval: Reset agency commission to 3% (A1) unless owner is payroll helper
    SELECT a.owner_id INTO _agency_owner_id
    FROM agencies a WHERE a.id = _withdrawal.agency_id;

    SELECT EXISTS(
      SELECT 1 FROM topup_helpers th
      WHERE th.user_id = _agency_owner_id
        AND th.is_verified = true
        AND th.payroll_enabled = true
    ) INTO _is_payroll_helper;

    IF NOT _is_payroll_helper THEN
      UPDATE agencies
      SET commission_rate = 3,
          level = 'A1',
          updated_at = NOW()
      WHERE id = _withdrawal.agency_id;
    END IF;

    -- If processed by a helper, credit their wallet
    IF _withdrawal.assigned_helper_id IS NOT NULL THEN
      _diamond_reward := _net_beans;
      
      IF _diamond_reward > 0 THEN
        _platform_fee := ROUND(_diamond_reward * 0.10, 2);
        _net_reward := _diamond_reward - _platform_fee;
        
        SELECT user_id INTO _helper_user_id 
        FROM topup_helpers 
        WHERE id = _withdrawal.assigned_helper_id;
        
        IF _helper_user_id IS NOT NULL THEN
          UPDATE agency_withdrawals
          SET 
            diamond_reward = _diamond_reward,
            platform_fee_amount = _platform_fee,
            helper_net_reward = _net_reward
          WHERE id = _withdrawal_id;
          
          UPDATE topup_helpers
          SET wallet_balance = COALESCE(wallet_balance, 0) + _net_reward
          WHERE id = _withdrawal.assigned_helper_id;
          
          INSERT INTO notifications (user_id, type, title, message, data)
          VALUES (
            _helper_user_id,
            'withdrawal_reward',
            '💎 Diamond Reward Received!',
            'You received ' || ROUND(_net_reward)::TEXT || ' diamonds for processing withdrawal (10% platform fee deducted)',
            jsonb_build_object(
              'withdrawal_id', _withdrawal_id,
              'gross_reward', _diamond_reward,
              'platform_fee', _platform_fee,
              'net_reward', _net_reward,
              'agency_id', _withdrawal.agency_id
            )
          );
        END IF;
      END IF;
    END IF;
    
    RETURN jsonb_build_object(
      'success', true, 
      'message', 'Withdrawal approved',
      'notes', _notes,
      'helper_id', _withdrawal.assigned_helper_id,
      'diamond_reward', _diamond_reward,
      'platform_fee', _platform_fee,
      'net_reward', _net_reward,
      'commission_reset', NOT _is_payroll_helper
    );
  ELSE
    UPDATE agency_withdrawals
    SET 
      status = _status,
      notes = _notes,
      processed_at = NOW()
    WHERE id = _withdrawal_id;
    
    IF _status = 'rejected' THEN
      UPDATE agencies
      SET beans_balance = COALESCE(beans_balance, 0) + _withdrawal.amount
      WHERE id = _withdrawal.agency_id;
    END IF;
    
    RETURN jsonb_build_object('success', true, 'message', 'Withdrawal ' || _status);
  END IF;
END;
$$;
