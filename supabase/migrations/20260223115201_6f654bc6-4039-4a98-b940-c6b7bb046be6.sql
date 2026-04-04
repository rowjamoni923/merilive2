
-- ===== FIX 1: SECURE add_coins_to_user - ADMIN ONLY =====
CREATE OR REPLACE FUNCTION public.add_coins_to_user(_user_id UUID, _amount INTEGER)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- CRITICAL: Only admins can add coins
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Unauthorized: Only admins can add coins';
  END IF;

  IF _amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be positive';
  END IF;
  
  UPDATE profiles 
  SET coins = COALESCE(coins, 0) + _amount 
  WHERE id = _user_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  -- Log the admin action
  INSERT INTO admin_logs (admin_id, action_type, target_id, target_type, details)
  VALUES (auth.uid()::text, 'add_coins', _user_id::text, 'user', 
    jsonb_build_object('amount', _amount, 'action', 'admin_coin_add'));
END;
$$;

-- ===== FIX 2: SECURE deduct_coins_from_user - ADMIN ONLY =====
CREATE OR REPLACE FUNCTION public.deduct_coins_from_user(p_user_id UUID, p_amount INTEGER)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_balance INTEGER;
  v_new_balance INTEGER;
BEGIN
  -- CRITICAL: Only admins can deduct coins
  IF NOT public.is_admin(auth.uid()) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  SELECT coins INTO v_current_balance
  FROM profiles
  WHERE id = p_user_id
  FOR UPDATE;
  
  IF v_current_balance IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'User not found');
  END IF;
  
  IF v_current_balance < p_amount THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient balance', 'balance', v_current_balance);
  END IF;
  
  v_new_balance := v_current_balance - p_amount;
  
  UPDATE profiles
  SET coins = v_new_balance, updated_at = now()
  WHERE id = p_user_id;

  -- Log the admin action
  INSERT INTO admin_logs (admin_id, action_type, target_id, target_type, details)
  VALUES (auth.uid()::text, 'deduct_coins', p_user_id::text, 'user', 
    jsonb_build_object('amount', p_amount, 'previous_balance', v_current_balance, 'new_balance', v_new_balance));
  
  RETURN jsonb_build_object('success', true, 'new_balance', v_new_balance);
END;
$$;
