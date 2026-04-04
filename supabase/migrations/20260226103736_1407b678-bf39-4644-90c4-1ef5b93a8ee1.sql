
-- =============================================
-- FINAL COMPLETE FIX: All table GRANT permissions
-- This is the ROOT CAUSE of all reward issues
-- =============================================

-- Config tables: everyone can read
GRANT SELECT ON public.daily_login_rewards_config TO authenticated, anon;
GRANT SELECT ON public.consumption_return_config TO authenticated, anon;
GRANT SELECT ON public.limited_time_offers TO authenticated, anon;
GRANT SELECT ON public.first_recharge_bonus TO authenticated, anon;

-- Admin write access on config tables
GRANT INSERT, UPDATE, DELETE ON public.daily_login_rewards_config TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.consumption_return_config TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.limited_time_offers TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.first_recharge_bonus TO authenticated;

-- User data tables
GRANT SELECT, INSERT ON public.daily_login_claims TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.user_login_streaks TO authenticated;
GRANT SELECT, INSERT ON public.first_recharge_claims TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.consumption_return_history TO authenticated;
GRANT SELECT ON public.gift_transactions TO authenticated;

-- Realtime publication
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'daily_login_rewards_config') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.daily_login_rewards_config;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'limited_time_offers') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.limited_time_offers;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'consumption_return_config') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.consumption_return_config;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'first_recharge_bonus') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.first_recharge_bonus;
  END IF;
END $$;
