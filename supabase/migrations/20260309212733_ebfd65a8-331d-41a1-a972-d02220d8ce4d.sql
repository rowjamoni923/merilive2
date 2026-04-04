
-- Transfer incorrectly credited diamonds to coins for affected users
DO $$
BEGIN
  PERFORM set_config('app.bypass_profile_protection', 'true', true);
  UPDATE profiles 
  SET coins = COALESCE(coins, 0) + COALESCE(diamonds, 0), 
      diamonds = 0 
  WHERE diamonds > 0;
  PERFORM set_config('app.bypass_profile_protection', 'false', true);
END;
$$;
