-- Update admin_process_withdrawal function to include 10% platform fee for helpers
CREATE OR REPLACE FUNCTION public.admin_process_withdrawal(
  _withdrawal_id UUID,
  _action TEXT, -- 'approve', 'reject', 'complete'
  _notes TEXT DEFAULT NULL
)
RETURNS BOOLEAN
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
BEGIN
  -- Check if caller is admin
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  
  -- Get withdrawal info
  SELECT * INTO _withdrawal
  FROM agency_withdrawals
  WHERE id = _withdrawal_id;
  
  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;
  
  IF _action = 'approve' THEN
    UPDATE agency_withdrawals
    SET status = 'approved', processed_at = now(), processed_by = auth.uid(), notes = _notes
    WHERE id = _withdrawal_id;
    
  ELSIF _action = 'reject' THEN
    -- Return money to agency wallet
    UPDATE agencies
    SET wallet_balance = wallet_balance + _withdrawal.amount
    WHERE id = _withdrawal.agency_id;
    
    UPDATE agency_withdrawals
    SET status = 'rejected', processed_at = now(), processed_by = auth.uid(), notes = _notes
    WHERE id = _withdrawal_id;
    
  ELSIF _action = 'complete' THEN
    -- Update withdrawal status
    UPDATE agency_withdrawals
    SET status = 'completed', processed_at = now(), processed_by = auth.uid(), notes = _notes
    WHERE id = _withdrawal_id;
    
    -- If this was processed by a helper (status was 'processing'), credit their wallet with 10% fee deduction
    IF _withdrawal.assigned_helper_id IS NOT NULL AND _withdrawal.diamond_reward IS NOT NULL AND _withdrawal.diamond_reward > 0 THEN
      -- Calculate 10% platform fee
      _diamond_reward := _withdrawal.diamond_reward;
      _platform_fee := ROUND(_diamond_reward * 0.10, 2);
      _net_reward := _diamond_reward - _platform_fee;
      
      -- Get helper's user_id from topup_helpers
      SELECT user_id INTO _helper_user_id
      FROM topup_helpers
      WHERE id = _withdrawal.assigned_helper_id;
      
      IF _helper_user_id IS NOT NULL THEN
        -- Credit helper's wallet with net reward (90%)
        UPDATE topup_helpers
        SET 
          wallet_balance = COALESCE(wallet_balance, 0) + _net_reward,
          total_earnings = COALESCE(total_earnings, 0) + _net_reward,
          updated_at = now()
        WHERE id = _withdrawal.assigned_helper_id;
        
        -- Also add to helper's profile diamond balance
        UPDATE profiles
        SET diamonds = COALESCE(diamonds, 0) + _net_reward::BIGINT
        WHERE id = _helper_user_id;
        
        -- Send notification to helper about the reward
        INSERT INTO notifications (user_id, type, title, message, data)
        VALUES (
          _helper_user_id,
          'withdrawal_reward',
          '💎 ডায়মন্ড রিওয়ার্ড পেয়েছেন!',
          'উইথড্রয়াল প্রসেস করার জন্য ' || _net_reward::TEXT || ' ডায়মন্ড পেয়েছেন (১০% প্ল্যাটফর্ম ফি বাদে)',
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
  
  -- Log admin action
  PERFORM public.log_admin_action(
    'process_withdrawal',
    'withdrawal',
    _withdrawal_id,
    jsonb_build_object(
      'action', _action, 
      'amount', _withdrawal.amount, 
      'notes', _notes,
      'helper_id', _withdrawal.assigned_helper_id,
      'diamond_reward', _withdrawal.diamond_reward
    )
  );
  
  RETURN TRUE;
END;
$$;

-- Add a column to track platform fees if not exists
ALTER TABLE agency_withdrawals 
ADD COLUMN IF NOT EXISTS platform_fee_amount NUMERIC DEFAULT 0;

-- Add a column to track net helper reward
ALTER TABLE agency_withdrawals 
ADD COLUMN IF NOT EXISTS helper_net_reward NUMERIC DEFAULT 0;