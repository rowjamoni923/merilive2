-- Drop existing function and recreate with English notification messages
DROP FUNCTION IF EXISTS public.admin_process_withdrawal(UUID, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.admin_process_withdrawal(
  _withdrawal_id UUID,
  _status TEXT,
  _notes TEXT DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  _withdrawal RECORD;
  _helper_id UUID;
  _diamond_reward NUMERIC;
  _platform_fee NUMERIC;
  _net_reward NUMERIC;
  _helper_user_id UUID;
  _usd_amount NUMERIC;
  _net_beans NUMERIC;
BEGIN
  -- Get current withdrawal with computed net_withdrawal_beans
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

  -- If approving, update the status
  IF _status = 'approved' THEN
    -- Get the net beans amount from payment_details or calculate it
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
    
    -- If this was processed by a helper, credit their wallet
    IF _withdrawal.assigned_helper_id IS NOT NULL THEN
      -- Diamond reward equals the beans amount (1 bean = 1 diamond for helpers)
      _diamond_reward := _net_beans;
      
      IF _diamond_reward > 0 THEN
        -- Calculate 10% platform fee
        _platform_fee := ROUND(_diamond_reward * 0.10, 2);
        _net_reward := _diamond_reward - _platform_fee;
        
        -- Get helper's user_id from topup_helpers
        SELECT user_id INTO _helper_user_id 
        FROM topup_helpers 
        WHERE id = _withdrawal.assigned_helper_id;
        
        IF _helper_user_id IS NOT NULL THEN
          -- Update the withdrawal record with reward info
          UPDATE agency_withdrawals
          SET 
            diamond_reward = _diamond_reward,
            platform_fee_amount = _platform_fee,
            helper_net_reward = _net_reward
          WHERE id = _withdrawal_id;
          
          -- Credit the helper's wallet balance
          UPDATE topup_helpers
          SET wallet_balance = COALESCE(wallet_balance, 0) + _net_reward
          WHERE id = _withdrawal.assigned_helper_id;
          
          -- Create notification for helper (in English)
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
      'net_reward', _net_reward
    );
  ELSE
    -- Rejecting
    UPDATE agency_withdrawals
    SET 
      status = _status,
      notes = _notes,
      processed_at = NOW()
    WHERE id = _withdrawal_id;
    
    -- If rejected, return beans to agency
    IF _status = 'rejected' THEN
      UPDATE agencies
      SET beans_balance = COALESCE(beans_balance, 0) + _withdrawal.amount
      WHERE id = _withdrawal.agency_id;
    END IF;
    
    RETURN jsonb_build_object('success', true, 'message', 'Withdrawal ' || _status);
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;