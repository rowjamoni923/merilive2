
-- ================================================
-- FIX: Full GRANT + Admin RLS for all Reward tables
-- ================================================

-- 1. DAILY LOGIN REWARDS CONFIG - Admin can CRUD, users can read
GRANT SELECT, INSERT, UPDATE, DELETE ON public.daily_login_rewards_config TO authenticated;

DROP POLICY IF EXISTS "Admins can manage login rewards" ON public.daily_login_rewards_config;
CREATE POLICY "Admins can manage login rewards" ON public.daily_login_rewards_config
  FOR ALL USING (public.is_admin(auth.uid()));

-- 2. FIRST RECHARGE BONUS - Admin can CRUD, users can read
GRANT SELECT, INSERT, UPDATE, DELETE ON public.first_recharge_bonus TO authenticated;

ALTER TABLE public.first_recharge_bonus ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage first recharge" ON public.first_recharge_bonus;
CREATE POLICY "Admins can manage first recharge" ON public.first_recharge_bonus
  FOR ALL USING (public.is_admin(auth.uid()));

-- 3. CONSUMPTION RETURN CONFIG - Admin can CRUD, users can read
GRANT SELECT, INSERT, UPDATE, DELETE ON public.consumption_return_config TO authenticated;

DROP POLICY IF EXISTS "Admins can manage cashback tiers" ON public.consumption_return_config;
CREATE POLICY "Admins can manage cashback tiers" ON public.consumption_return_config
  FOR ALL USING (public.is_admin(auth.uid()));

-- 4. LIMITED TIME OFFERS - Admin can CRUD, users can read
GRANT SELECT, INSERT, UPDATE, DELETE ON public.limited_time_offers TO authenticated;

DROP POLICY IF EXISTS "Admins can manage offers" ON public.limited_time_offers;
CREATE POLICY "Admins can manage offers" ON public.limited_time_offers
  FOR ALL USING (public.is_admin(auth.uid()));

-- 5. DAILY LOGIN CLAIMS - Admin can read all
DROP POLICY IF EXISTS "Admins can view all claims" ON public.daily_login_claims;
CREATE POLICY "Admins can view all claims" ON public.daily_login_claims
  FOR SELECT USING (public.is_admin(auth.uid()));

-- 6. USER LOGIN STREAKS - Admin can read all
DROP POLICY IF EXISTS "Admins can view all streaks" ON public.user_login_streaks;
CREATE POLICY "Admins can view all streaks" ON public.user_login_streaks
  FOR SELECT USING (public.is_admin(auth.uid()));

-- 7. CONSUMPTION RETURN HISTORY - Admin can manage
GRANT SELECT, INSERT, UPDATE, DELETE ON public.consumption_return_history TO authenticated;

DROP POLICY IF EXISTS "Admins can manage cashback history" ON public.consumption_return_history;
CREATE POLICY "Admins can manage cashback history" ON public.consumption_return_history
  FOR ALL USING (public.is_admin(auth.uid()));

-- 8. FIRST RECHARGE CLAIMS - Admin can view
GRANT SELECT ON public.first_recharge_claims TO authenticated;

DROP POLICY IF EXISTS "Admins can view all first recharge claims" ON public.first_recharge_claims;
CREATE POLICY "Admins can view all first recharge claims" ON public.first_recharge_claims
  FOR SELECT USING (public.is_admin(auth.uid()));

-- 9. Add these tables to realtime publication for instant updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.daily_login_rewards_config;
ALTER PUBLICATION supabase_realtime ADD TABLE public.limited_time_offers;
ALTER PUBLICATION supabase_realtime ADD TABLE public.consumption_return_config;
ALTER PUBLICATION supabase_realtime ADD TABLE public.first_recharge_bonus;
