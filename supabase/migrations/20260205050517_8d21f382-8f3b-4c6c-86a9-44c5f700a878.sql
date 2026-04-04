-- Create atomic functions for safe balance updates
-- These prevent race conditions by using SQL INCREMENT instead of JavaScript calculation

-- Function to atomically add coins to a user's profile
CREATE OR REPLACE FUNCTION public.add_coins_to_user(
  _user_id UUID,
  _amount INTEGER
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be positive';
  END IF;
  
  UPDATE profiles 
  SET coins = COALESCE(coins, 0) + _amount 
  WHERE id = _user_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found';
  END IF;
END;
$$;

-- Function to atomically add diamonds to an agency
CREATE OR REPLACE FUNCTION public.add_diamonds_to_agency(
  _agency_id UUID,
  _amount INTEGER
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be positive';
  END IF;
  
  UPDATE agencies 
  SET diamond_balance = COALESCE(diamond_balance, 0) + _amount 
  WHERE id = _agency_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Agency not found';
  END IF;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.add_coins_to_user(UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_diamonds_to_agency(UUID, INTEGER) TO authenticated;