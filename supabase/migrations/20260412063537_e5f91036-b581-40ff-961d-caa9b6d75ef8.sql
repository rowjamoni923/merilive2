CREATE OR REPLACE FUNCTION public.admin_add_user_coins(_user_id uuid, _amount integer, _note text DEFAULT NULL)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user_profile RECORD;
  _new_balance INTEGER;
  _new_consumption BIGINT;
  _new_level INTEGER;
  _is_female_host BOOLEAN;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RETURN json_build_object('success', false, 'error', 'Not authorized');
  END IF;

  SELECT * INTO _user_profile FROM profiles WHERE id = _user_id;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'User not found');
  END IF;

  _is_female_host := (_user_profile.is_host = true AND _user_profile.gender = 'female');
  _new_consumption := COALESCE(_user_profile.total_consumption, 0) + _amount;

  IF _is_female_host THEN
    _new_level := COALESCE(_user_profile.user_level, 0);
  ELSE
    _new_level := public.calculate_user_level(_new_consumption);
  END IF;

  -- Set bypass flag so protect_sensitive_profile_columns trigger allows the update
  PERFORM set_config('app.bypass_profile_protection', 'true', true);

  UPDATE profiles
  SET coins = COALESCE(coins, 0) + _amount,
      total_consumption = _new_consumption,
      user_level = _new_level
  WHERE id = _user_id
  RETURNING coins INTO _new_balance;

  PERFORM public.log_admin_action('add_user_coins', 'user', _user_id,
    jsonb_build_object('amount', _amount, 'note', _note, 'new_balance', _new_balance, 'new_level', _new_level));

  RETURN json_build_object('success', true, 'user_id', _user_id, 'amount_added', _amount, 'new_balance', _new_balance, 'new_level', _new_level);
END;
$$;