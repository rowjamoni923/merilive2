
-- 1. Fix admin_add_user_coins: Do NOT increment total_consumption when admin adds coins
CREATE OR REPLACE FUNCTION public.admin_add_user_coins(_user_id uuid, _amount integer, _note text DEFAULT NULL)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _new_balance INTEGER;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RETURN json_build_object('success', false, 'error', 'Not authorized');
  END IF;

  IF _amount <= 0 THEN
    RETURN json_build_object('success', false, 'error', 'Amount must be positive');
  END IF;

  -- Set bypass flag so protect_sensitive_profile_columns trigger allows the update
  PERFORM set_config('app.bypass_profile_protection', 'true', true);

  -- Only update coins balance, NOT total_consumption
  UPDATE profiles
  SET coins = COALESCE(coins, 0) + _amount
  WHERE id = _user_id
  RETURNING coins INTO _new_balance;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'User not found');
  END IF;

  -- Log admin action
  PERFORM public.log_admin_action('add_user_coins', 'user', _user_id,
    jsonb_build_object('amount', _amount, 'note', _note, 'new_balance', _new_balance));

  RETURN json_build_object('success', true, 'user_id', _user_id, 'amount_added', _amount, 'new_balance', _new_balance);
END;
$$;

-- 2. Create helper_add_coins_to_user RPC (used by helpers/traders to add diamonds to users)
CREATE OR REPLACE FUNCTION public.helper_add_coins_to_user(_user_id uuid, _amount integer)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _new_balance INTEGER;
BEGIN
  IF _amount <= 0 THEN
    RETURN json_build_object('success', false, 'error', 'Amount must be positive');
  END IF;

  -- Set bypass flag
  PERFORM set_config('app.bypass_profile_protection', 'true', true);

  -- Only update coins balance, NOT total_consumption
  UPDATE profiles
  SET coins = COALESCE(coins, 0) + _amount
  WHERE id = _user_id
  RETURNING coins INTO _new_balance;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'User not found');
  END IF;

  RETURN json_build_object('success', true, 'new_balance', _new_balance);
END;
$$;

-- 3. Fix add_coins_to_user to also bypass trigger
CREATE OR REPLACE FUNCTION public.add_coins_to_user(_user_id uuid, _amount integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Unauthorized: Only admins can add coins';
  END IF;
  IF _amount <= 0 THEN RAISE EXCEPTION 'Amount must be positive'; END IF;

  PERFORM set_config('app.bypass_profile_protection', 'true', true);

  UPDATE profiles SET coins = COALESCE(coins, 0) + _amount WHERE id = _user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'User not found'; END IF;

  INSERT INTO admin_logs (admin_id, action_type, target_id, target_type, details)
  VALUES (auth.uid()::text, 'add_coins', _user_id::text, 'user', jsonb_build_object('amount', _amount, 'action', 'admin_coin_add'));
END;
$$;
