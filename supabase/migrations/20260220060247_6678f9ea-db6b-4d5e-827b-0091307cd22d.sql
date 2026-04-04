
-- Fix add_beans_to_user: use correct column name 'beans' not 'beans_balance'
CREATE OR REPLACE FUNCTION public.add_beans_to_user(_user_id UUID, _amount INTEGER)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE profiles
  SET beans = COALESCE(beans, 0) + _amount
  WHERE id = _user_id;
END;
$$;

-- Fix add_diamonds_to_user: diamonds don't have a separate column, 
-- they are tracked via coins (the app's virtual currency)
-- Based on the app logic, diamond rewards should go to beans (host currency)
-- But let's add a diamonds column for proper tracking
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS diamonds INTEGER DEFAULT 0;

-- Now fix add_diamonds_to_user to use the new diamonds column
CREATE OR REPLACE FUNCTION public.add_diamonds_to_user(_user_id UUID, _amount INTEGER)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE profiles
  SET diamonds = COALESCE(diamonds, 0) + _amount
  WHERE id = _user_id;
END;
$$;

-- Fix add_coins_to_user to also have proper search_path
CREATE OR REPLACE FUNCTION public.add_coins_to_user(_user_id UUID, _amount INTEGER)
RETURNS VOID
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
