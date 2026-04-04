
-- Grant SELECT permissions on reward config tables for authenticated users
GRANT SELECT ON public.daily_login_rewards_config TO authenticated;
GRANT SELECT ON public.daily_login_rewards_config TO anon;

GRANT SELECT, INSERT ON public.daily_login_claims TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.user_login_streaks TO authenticated;

GRANT SELECT ON public.consumption_return_config TO authenticated;
GRANT SELECT ON public.consumption_return_config TO anon;

GRANT SELECT ON public.limited_time_offers TO authenticated;
GRANT SELECT ON public.limited_time_offers TO anon;

GRANT SELECT ON public.first_recharge_claims TO authenticated;
GRANT SELECT, INSERT ON public.first_recharge_claims TO authenticated;

GRANT SELECT ON public.first_recharge_bonus TO authenticated;
GRANT SELECT ON public.first_recharge_bonus TO anon;

GRANT SELECT ON public.consumption_return_history TO authenticated;

-- Enable RLS on all reward tables
ALTER TABLE public.daily_login_rewards_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_login_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_login_streaks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consumption_return_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.limited_time_offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.first_recharge_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consumption_return_history ENABLE ROW LEVEL SECURITY;

-- RLS policies for daily_login_rewards_config (read-only for everyone)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'daily_login_rewards_config' AND policyname = 'Anyone can read login rewards config') THEN
    CREATE POLICY "Anyone can read login rewards config" ON public.daily_login_rewards_config FOR SELECT USING (true);
  END IF;
END $$;

-- RLS policies for daily_login_claims (users see own claims)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'daily_login_claims' AND policyname = 'Users can read own claims') THEN
    CREATE POLICY "Users can read own claims" ON public.daily_login_claims FOR SELECT USING (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'daily_login_claims' AND policyname = 'Users can insert own claims') THEN
    CREATE POLICY "Users can insert own claims" ON public.daily_login_claims FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- RLS policies for user_login_streaks
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'user_login_streaks' AND policyname = 'Users can read own streak') THEN
    CREATE POLICY "Users can read own streak" ON public.user_login_streaks FOR SELECT USING (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'user_login_streaks' AND policyname = 'Users can upsert own streak') THEN
    CREATE POLICY "Users can upsert own streak" ON public.user_login_streaks FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'user_login_streaks' AND policyname = 'Users can update own streak') THEN
    CREATE POLICY "Users can update own streak" ON public.user_login_streaks FOR UPDATE USING (auth.uid() = user_id);
  END IF;
END $$;

-- RLS policies for consumption_return_config (read-only)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'consumption_return_config' AND policyname = 'Anyone can read cashback config') THEN
    CREATE POLICY "Anyone can read cashback config" ON public.consumption_return_config FOR SELECT USING (true);
  END IF;
END $$;

-- RLS policies for limited_time_offers (read-only)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'limited_time_offers' AND policyname = 'Anyone can read active offers') THEN
    CREATE POLICY "Anyone can read active offers" ON public.limited_time_offers FOR SELECT USING (true);
  END IF;
END $$;

-- RLS policies for first_recharge_claims
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'first_recharge_claims' AND policyname = 'Users can read own first recharge') THEN
    CREATE POLICY "Users can read own first recharge" ON public.first_recharge_claims FOR SELECT USING (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'first_recharge_claims' AND policyname = 'Users can claim first recharge') THEN
    CREATE POLICY "Users can claim first recharge" ON public.first_recharge_claims FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- RLS policies for consumption_return_history
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'consumption_return_history' AND policyname = 'Users can read own cashback history') THEN
    CREATE POLICY "Users can read own cashback history" ON public.consumption_return_history FOR SELECT USING (auth.uid() = user_id);
  END IF;
END $$;

-- Also grant gift_transactions SELECT for weekly spend calculation
GRANT SELECT ON public.gift_transactions TO authenticated;

-- RLS for gift_transactions - users can see own sent gifts
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'gift_transactions' AND policyname = 'Users can read own sent gifts') THEN
    CREATE POLICY "Users can read own sent gifts" ON public.gift_transactions FOR SELECT USING (auth.uid() = sender_id OR auth.uid() = receiver_id);
  END IF;
END $$;
