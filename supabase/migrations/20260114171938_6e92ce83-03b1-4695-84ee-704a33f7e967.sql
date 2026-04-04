
-- Create function for admin to add coins to any user
CREATE OR REPLACE FUNCTION public.admin_add_user_coins(
  _user_id UUID,
  _amount INTEGER,
  _note TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user_profile RECORD;
  _new_balance INTEGER;
BEGIN
  -- Check if caller is admin
  IF NOT public.is_admin(auth.uid()) THEN
    RETURN json_build_object('success', false, 'error', 'Not authorized');
  END IF;
  
  -- Get user profile
  SELECT * INTO _user_profile FROM profiles WHERE id = _user_id;
  
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'User not found');
  END IF;
  
  -- Update user coins
  UPDATE profiles 
  SET coins = COALESCE(coins, 0) + _amount
  WHERE id = _user_id
  RETURNING coins INTO _new_balance;
  
  -- Log admin action
  PERFORM public.log_admin_action(
    'add_user_coins',
    'user',
    _user_id,
    jsonb_build_object(
      'amount', _amount,
      'note', _note,
      'previous_balance', COALESCE(_user_profile.coins, 0),
      'new_balance', _new_balance
    )
  );
  
  RETURN json_build_object(
    'success', true,
    'user_id', _user_id,
    'amount_added', _amount,
    'new_balance', _new_balance
  );
END;
$$;
