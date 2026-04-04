
-- =============================================
-- FIX 1: Create secure claim_daily_login_reward RPC
-- This replaces client-side add_coins_to_user call
-- =============================================
CREATE OR REPLACE FUNCTION public.claim_daily_login_reward()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_today DATE;
  v_streak RECORD;
  v_current_streak INT;
  v_next_day INT;
  v_reward RECORD;
  v_already_claimed BOOLEAN;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  v_today := CURRENT_DATE;

  -- Check if already claimed today
  SELECT EXISTS(
    SELECT 1 FROM daily_login_claims 
    WHERE user_id = v_user_id AND claimed_date = v_today
  ) INTO v_already_claimed;

  IF v_already_claimed THEN
    RETURN jsonb_build_object('success', false, 'error', 'Already claimed today');
  END IF;

  -- Get current streak
  SELECT * INTO v_streak FROM user_login_streaks WHERE user_id = v_user_id;
  
  v_current_streak := COALESCE(v_streak.current_streak, 0);
  
  -- Check if streak is broken (missed more than 1 day)
  IF v_streak.last_login_date IS NOT NULL THEN
    IF v_today - v_streak.last_login_date::date > 1 THEN
      v_current_streak := 0;
    END IF;
  END IF;

  -- Determine which day's reward to give
  v_next_day := (v_current_streak % 7) + 1;

  -- Get reward config
  SELECT * INTO v_reward FROM daily_login_rewards_config 
  WHERE day_number = v_next_day AND is_active = true;

  IF v_reward IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No reward config for day ' || v_next_day);
  END IF;

  -- Insert claim record
  INSERT INTO daily_login_claims (user_id, day_number, reward_coins, reward_diamonds, claimed_date)
  VALUES (v_user_id, v_next_day, v_reward.reward_coins, v_reward.reward_diamonds, v_today);

  -- Add coins directly (bypasses admin check since this is SECURITY DEFINER)
  IF v_reward.reward_coins > 0 THEN
    UPDATE profiles 
    SET coins = COALESCE(coins, 0) + v_reward.reward_coins 
    WHERE id = v_user_id;
  END IF;

  -- Update streak
  IF v_streak.id IS NOT NULL THEN
    UPDATE user_login_streaks SET
      current_streak = CASE WHEN v_current_streak + 1 > 7 THEN 1 ELSE v_current_streak + 1 END,
      last_login_date = v_today,
      total_logins = COALESCE(total_logins, 0) + 1,
      updated_at = now()
    WHERE user_id = v_user_id;
  ELSE
    INSERT INTO user_login_streaks (user_id, current_streak, last_login_date, total_logins)
    VALUES (v_user_id, 1, v_today, 1);
  END IF;

  RETURN jsonb_build_object(
    'success', true, 
    'day', v_next_day,
    'coins', v_reward.reward_coins,
    'diamonds', v_reward.reward_diamonds,
    'new_streak', v_current_streak + 1
  );
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.claim_daily_login_reward() TO authenticated;

-- =============================================
-- FIX 2: Restore profiles SELECT for authenticated users (own data only)
-- The previous migration removed "Authenticated users can view public profiles"
-- but some queries need to read own profile data
-- =============================================

-- Ensure "Users can view own full profile" policy exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'profiles' 
    AND policyname = 'Users can view own full profile'
  ) THEN
    CREATE POLICY "Users can view own full profile"
    ON public.profiles FOR SELECT
    USING (auth.uid() = id);
  END IF;
END $$;

-- =============================================
-- FIX 3: Fix allowed_external_links permissions
-- =============================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'allowed_external_links' 
    AND policyname = 'Anyone can view active links'
  ) THEN
    CREATE POLICY "Anyone can view active links"
    ON public.allowed_external_links FOR SELECT
    USING (is_active = true);
  END IF;
END $$;

-- Ensure RLS is enabled
ALTER TABLE public.allowed_external_links ENABLE ROW LEVEL SECURITY;

-- Grant SELECT to authenticated and anon
GRANT SELECT ON public.allowed_external_links TO authenticated, anon;

-- =============================================
-- FIX 4: Ensure rewards-related tables have proper read permissions
-- =============================================
GRANT SELECT ON public.daily_login_rewards_config TO authenticated;
GRANT SELECT ON public.daily_login_claims TO authenticated;
GRANT INSERT ON public.daily_login_claims TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.user_login_streaks TO authenticated;
GRANT SELECT ON public.consumption_return_config TO authenticated;
GRANT SELECT ON public.limited_time_offers TO authenticated;
GRANT SELECT ON public.first_recharge_bonus TO authenticated;
GRANT SELECT ON public.first_recharge_claims TO authenticated;
GRANT SELECT ON public.consumption_return_history TO authenticated;

-- Ensure RLS policies exist for daily login tables
DO $$
BEGIN
  -- daily_login_claims: users can see/insert their own claims
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'daily_login_claims' AND policyname = 'Users can view own claims') THEN
    CREATE POLICY "Users can view own claims" ON public.daily_login_claims FOR SELECT USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'daily_login_claims' AND policyname = 'Users can insert own claims') THEN
    CREATE POLICY "Users can insert own claims" ON public.daily_login_claims FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;

  -- user_login_streaks: users can manage their own streak
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'user_login_streaks' AND policyname = 'Users can view own streak') THEN
    CREATE POLICY "Users can view own streak" ON public.user_login_streaks FOR SELECT USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'user_login_streaks' AND policyname = 'Users can manage own streak') THEN
    CREATE POLICY "Users can manage own streak" ON public.user_login_streaks FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;

  -- daily_login_rewards_config: everyone can read
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'daily_login_rewards_config' AND policyname = 'Anyone can view login rewards config') THEN
    CREATE POLICY "Anyone can view login rewards config" ON public.daily_login_rewards_config FOR SELECT USING (true);
  END IF;

  -- consumption_return_config: everyone can read active tiers
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'consumption_return_config' AND policyname = 'Anyone can view consumption tiers') THEN
    CREATE POLICY "Anyone can view consumption tiers" ON public.consumption_return_config FOR SELECT USING (true);
  END IF;

  -- limited_time_offers: everyone can read active offers
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'limited_time_offers' AND policyname = 'Anyone can view active offers') THEN
    CREATE POLICY "Anyone can view active offers" ON public.limited_time_offers FOR SELECT USING (true);
  END IF;

  -- first_recharge_bonus: everyone can read
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'first_recharge_bonus' AND policyname = 'Anyone can view first recharge config') THEN
    CREATE POLICY "Anyone can view first recharge config" ON public.first_recharge_bonus FOR SELECT USING (true);
  END IF;

  -- first_recharge_claims: users can view own
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'first_recharge_claims' AND policyname = 'Users can view own recharge claims') THEN
    CREATE POLICY "Users can view own recharge claims" ON public.first_recharge_claims FOR SELECT USING (auth.uid() = user_id);
  END IF;
END $$;

-- Enable RLS on all rewards tables
ALTER TABLE public.daily_login_rewards_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_login_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_login_streaks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consumption_return_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.limited_time_offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.first_recharge_bonus ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.first_recharge_claims ENABLE ROW LEVEL SECURITY;
