-- Enable REPLICA IDENTITY FULL for all admin-managed tables (for complete realtime updates)
-- This ensures all column data is sent in realtime events

DO $$
BEGIN
  -- Check and set REPLICA IDENTITY FULL for each table
  EXECUTE 'ALTER TABLE IF EXISTS public.banners REPLICA IDENTITY FULL';
  EXECUTE 'ALTER TABLE IF EXISTS public.gifts REPLICA IDENTITY FULL';
  EXECUTE 'ALTER TABLE IF EXISTS public.coin_packages REPLICA IDENTITY FULL';
  EXECUTE 'ALTER TABLE IF EXISTS public.currency_rates REPLICA IDENTITY FULL';
  EXECUTE 'ALTER TABLE IF EXISTS public.branding_settings REPLICA IDENTITY FULL';
  EXECUTE 'ALTER TABLE IF EXISTS public.game_settings REPLICA IDENTITY FULL';
  EXECUTE 'ALTER TABLE IF EXISTS public.app_settings REPLICA IDENTITY FULL';
  EXECUTE 'ALTER TABLE IF EXISTS public.topup_payment_methods REPLICA IDENTITY FULL';
  EXECUTE 'ALTER TABLE IF EXISTS public.user_level_tiers REPLICA IDENTITY FULL';
  EXECUTE 'ALTER TABLE IF EXISTS public.avatar_frames REPLICA IDENTITY FULL';
  EXECUTE 'ALTER TABLE IF EXISTS public.level_privileges REPLICA IDENTITY FULL';
  EXECUTE 'ALTER TABLE IF EXISTS public.level_animations REPLICA IDENTITY FULL';
  EXECUTE 'ALTER TABLE IF EXISTS public.trader_level_tiers REPLICA IDENTITY FULL';
  EXECUTE 'ALTER TABLE IF EXISTS public.daily_tasks REPLICA IDENTITY FULL';
  EXECUTE 'ALTER TABLE IF EXISTS public.game_server_settings REPLICA IDENTITY FULL';
EXCEPTION 
  WHEN OTHERS THEN 
    RAISE NOTICE 'Some tables might not exist, continuing...';
END $$;

-- Add tables to realtime publication (skip if already added)
DO $$
BEGIN
  -- Try to add each table, skip if already exists
  ALTER PUBLICATION supabase_realtime ADD TABLE banners;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE gifts;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE coin_packages;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE currency_rates;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE branding_settings;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE game_settings;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE app_settings;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE topup_payment_methods;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE user_level_tiers;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE avatar_frames;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE level_privileges;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE trader_level_tiers;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE daily_tasks;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE game_server_settings;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;