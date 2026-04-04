
CREATE OR REPLACE FUNCTION public.exchange_user_beans_to_diamonds(
  _user_id uuid,
  _beans_amount integer,
  _diamonds_reward integer,
  _tier_id text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_beans INTEGER;
BEGIN
  -- CRITICAL: User can only exchange their own beans
  IF auth.uid() IS NULL OR auth.uid() != _user_id THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- Read beans from profiles (not gift_transactions)
  SELECT COALESCE(beans, 0) INTO current_beans
  FROM profiles WHERE id = _user_id FOR UPDATE;
  
  IF current_beans < _beans_amount THEN
    RAISE EXCEPTION 'Insufficient beans balance';
  END IF;
  
  -- Set bypass flag for protection trigger
  PERFORM set_config('app.bypass_profile_protection', 'true', true);
  
  -- Deduct beans and add diamonds atomically
  UPDATE profiles 
  SET beans = COALESCE(beans, 0) - _beans_amount,
      coins = COALESCE(coins, 0) + _diamonds_reward
  WHERE id = _user_id;
  
  PERFORM set_config('app.bypass_profile_protection', 'false', true);
  
  -- Log the exchange
  INSERT INTO user_beans_exchange_history (user_id, beans_spent, diamonds_received, tier_id)
  VALUES (_user_id, _beans_amount, _diamonds_reward, _tier_id);
  
  RETURN TRUE;
END;
$$;
