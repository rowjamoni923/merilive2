
-- =================================================
-- FIX: Remove conflicting level triggers that override user_level
-- Keep ONLY auto_update_level (which uses recalculate_single_user_level with NEVER DROP policy)
-- =================================================

-- DROP the 3 problematic triggers that DON'T respect NEVER DROP policy:

-- 1. update_level_on_profile_change (BEFORE UPDATE) - sets user_level=0 when total_recharged=0
DROP TRIGGER IF EXISTS update_level_on_profile_change ON profiles;

-- 2. trigger_update_level_on_profile (AFTER) - uses coins instead of topup, no NEVER DROP
DROP TRIGGER IF EXISTS trigger_update_level_on_profile ON profiles;

-- 3. trigger_update_level_on_profile_change (AFTER) - comprehensive but no NEVER DROP
DROP TRIGGER IF EXISTS trigger_update_level_on_profile_change ON profiles;

-- KEEP: trigger_auto_update_level_profiles (uses recalculate_single_user_level with NEVER DROP)
-- KEEP: trigger_auto_assign_level_frame (assigns frames)

-- Also fix recalculate_single_user_level to handle the case where
-- max_user_level column might not exist yet
-- Add max_user_level column if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'profiles' AND column_name = 'max_user_level'
  ) THEN
    ALTER TABLE profiles ADD COLUMN max_user_level INTEGER DEFAULT 0;
  END IF;
END $$;

-- Backfill max_user_level from current user_level where it's 0 or NULL
UPDATE profiles 
SET max_user_level = GREATEST(COALESCE(user_level, 0), COALESCE(max_user_level, 0))
WHERE COALESCE(max_user_level, 0) < COALESCE(user_level, 0);
