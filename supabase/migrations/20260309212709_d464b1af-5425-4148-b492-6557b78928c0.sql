
-- Fix _internal_add_diamonds to update 'coins' column with bypass flag
CREATE OR REPLACE FUNCTION public._internal_add_diamonds(_user_id uuid, _amount bigint)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Set bypass flag for the protection trigger
  PERFORM set_config('app.bypass_profile_protection', 'true', true);
  UPDATE profiles SET coins = COALESCE(coins, 0) + _amount WHERE id = _user_id;
  PERFORM set_config('app.bypass_profile_protection', 'false', true);
END;
$$;
