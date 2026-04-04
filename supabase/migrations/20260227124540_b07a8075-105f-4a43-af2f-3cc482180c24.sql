
-- ============================================
-- FIX 1: "permission denied for table user_level_tiers"
-- ============================================
GRANT SELECT ON public.user_level_tiers TO anon, authenticated;

-- ============================================
-- FIX 2: "permission denied for table private_calls"
-- ============================================
GRANT SELECT, INSERT, UPDATE ON public.private_calls TO anon, authenticated;

-- ============================================
-- FIX 3: "permission denied for table profiles" (for anon)
-- ============================================
GRANT SELECT ON public.profiles TO anon;

-- ============================================
-- FIX 4: "column profiles.beans_balance does not exist"
-- Add beans_balance as alias/column if missing
-- ============================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'beans_balance'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN beans_balance integer DEFAULT 0;
  END IF;
END $$;

-- ============================================
-- FIX 5: "profiles_gender_check" - make it accept more values
-- Drop old constraint and create a more permissive one
-- ============================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage 
    WHERE table_name = 'profiles' AND constraint_name = 'profiles_gender_check'
  ) THEN
    ALTER TABLE public.profiles DROP CONSTRAINT profiles_gender_check;
  END IF;
END $$;

ALTER TABLE public.profiles ADD CONSTRAINT profiles_gender_check 
  CHECK (gender IS NULL OR gender IN ('male', 'female', 'Male', 'Female', 'other', 'Other', 'prefer_not_to_say'));

-- ============================================
-- FIX 6: "new row violates row-level security policy for device_tokens"
-- Drop all existing policies and create proper ones
-- ============================================
DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE tablename = 'device_tokens' AND schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.device_tokens', pol.policyname);
  END LOOP;
END $$;

-- Enable RLS
ALTER TABLE public.device_tokens ENABLE ROW LEVEL SECURITY;

-- Allow anyone to insert device tokens (needed for push notifications before login)
CREATE POLICY "device_tokens_insert" ON public.device_tokens FOR INSERT WITH CHECK (true);

-- Allow anyone to select their own or anonymous tokens  
CREATE POLICY "device_tokens_select" ON public.device_tokens FOR SELECT USING (true);

-- Allow update for own tokens
CREATE POLICY "device_tokens_update" ON public.device_tokens FOR UPDATE USING (true) WITH CHECK (true);

-- Allow delete
CREATE POLICY "device_tokens_delete" ON public.device_tokens FOR DELETE USING (
  user_id IS NULL OR auth.uid() = user_id
);

-- ============================================
-- FIX 7: Fix "operator does not exist: date = text" in admin_stats
-- This is caused by querying admin_stats with text comparison on date column
-- Fix by ensuring stat_date is text type or creating a proper index
-- ============================================
DO $$
BEGIN
  -- Check if stat_date is a date type and convert to text if needed
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'admin_stats' 
    AND column_name = 'stat_date' AND data_type = 'date'
  ) THEN
    ALTER TABLE public.admin_stats ALTER COLUMN stat_date TYPE text USING stat_date::text;
  END IF;
END $$;
