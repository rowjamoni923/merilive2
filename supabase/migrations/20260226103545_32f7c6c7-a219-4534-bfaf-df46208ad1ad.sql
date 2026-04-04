
-- =============================================
-- CRITICAL FIX: Grant table-level permissions
-- Without these, RLS policies are useless
-- =============================================

-- 1. Config tables (read-only for users)
GRANT SELECT ON public.daily_login_rewards_config TO authenticated, anon;
GRANT SELECT ON public.consumption_return_config TO authenticated, anon;
GRANT SELECT ON public.limited_time_offers TO authenticated, anon;
GRANT SELECT ON public.first_recharge_bonus TO authenticated, anon;

-- 2. User data tables (users need read/write on their own data)
GRANT SELECT, INSERT ON public.daily_login_claims TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.user_login_streaks TO authenticated;
GRANT SELECT ON public.first_recharge_claims TO authenticated;
GRANT INSERT ON public.first_recharge_claims TO authenticated;
GRANT SELECT ON public.gift_transactions TO authenticated;
GRANT SELECT, INSERT ON public.consumption_return_history TO authenticated;

-- 3. Admin full access on config tables
GRANT INSERT, UPDATE, DELETE ON public.daily_login_rewards_config TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.consumption_return_config TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.limited_time_offers TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.first_recharge_bonus TO authenticated;

-- 4. Clean up duplicate policies to avoid confusion
DROP POLICY IF EXISTS "Anyone can read cashback config" ON public.consumption_return_config;
DROP POLICY IF EXISTS "Anyone can view consumption tiers" ON public.consumption_return_config;
DROP POLICY IF EXISTS "Anyone can read login rewards config" ON public.daily_login_rewards_config;
DROP POLICY IF EXISTS "Anyone can read first recharge bonus config" ON public.first_recharge_bonus;
DROP POLICY IF EXISTS "Users can view own claims" ON public.daily_login_claims;
DROP POLICY IF EXISTS "Users can view their own claims" ON public.daily_login_claims;
DROP POLICY IF EXISTS "Users can insert their own claims" ON public.daily_login_claims;
DROP POLICY IF EXISTS "Users can view own streak" ON public.user_login_streaks;
DROP POLICY IF EXISTS "Users can view their own streak" ON public.user_login_streaks;
DROP POLICY IF EXISTS "Users can update their own streak" ON public.user_login_streaks;
DROP POLICY IF EXISTS "Users can upsert their own streak" ON public.user_login_streaks;
DROP POLICY IF EXISTS "Users can view own recharge claims" ON public.first_recharge_claims;
DROP POLICY IF EXISTS "Users can view their own claims" ON public.first_recharge_claims;
DROP POLICY IF EXISTS "System can insert claims" ON public.first_recharge_claims;

-- 5. Ensure realtime publication (safe idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'daily_login_rewards_config'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.daily_login_rewards_config;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'limited_time_offers'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.limited_time_offers;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'consumption_return_config'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.consumption_return_config;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'first_recharge_bonus'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.first_recharge_bonus;
  END IF;
END $$;
