
-- Service-level functions for leaderboard reward distribution
-- Use app.bypass_profile_protection to bypass the trigger

CREATE OR REPLACE FUNCTION public.service_add_beans(p_user_id uuid, p_amount integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be positive';
  END IF;
  
  -- Set bypass flag for the trigger
  PERFORM set_config('app.bypass_profile_protection', 'true', true);
  
  UPDATE profiles
  SET beans = COALESCE(beans, 0) + p_amount
  WHERE id = p_user_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found';
  END IF;
  
  -- Reset bypass flag
  PERFORM set_config('app.bypass_profile_protection', 'false', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.service_add_diamonds(p_user_id uuid, p_amount integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be positive';
  END IF;
  
  PERFORM set_config('app.bypass_profile_protection', 'true', true);
  
  UPDATE profiles
  SET coins = COALESCE(coins, 0) + p_amount
  WHERE id = p_user_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found';
  END IF;
  
  PERFORM set_config('app.bypass_profile_protection', 'false', true);
END;
$$;

-- Revoke public access
REVOKE ALL ON FUNCTION public.service_add_beans(uuid, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.service_add_diamonds(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.service_add_beans(uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.service_add_diamonds(uuid, integer) TO service_role;

-- Retroactively credit all missed rewards
CREATE OR REPLACE FUNCTION public.retroactive_leaderboard_credit()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
  credited_count integer := 0;
BEGIN
  PERFORM set_config('app.bypass_profile_protection', 'true', true);
  
  FOR r IN 
    SELECT user_id, SUM(reward_beans)::integer as total_beans, SUM(reward_diamonds)::integer as total_diamonds
    FROM leaderboard_reward_history
    WHERE (reward_beans > 0 OR reward_diamonds > 0)
    GROUP BY user_id
  LOOP
    IF r.total_beans > 0 THEN
      UPDATE profiles SET beans = COALESCE(beans, 0) + r.total_beans WHERE id = r.user_id;
    END IF;
    IF r.total_diamonds > 0 THEN
      UPDATE profiles SET coins = COALESCE(coins, 0) + r.total_diamonds WHERE id = r.user_id;
    END IF;
    credited_count := credited_count + 1;
  END LOOP;
  
  PERFORM set_config('app.bypass_profile_protection', 'false', true);
  RETURN credited_count || ' users credited';
END;
$$;

SELECT public.retroactive_leaderboard_credit();

DROP FUNCTION public.retroactive_leaderboard_credit();
