-- ============================================
-- FIX: User level persistence issue
-- Ensure user_level NEVER decreases
-- Add max_user_level column to store highest ever achieved level
-- ============================================

-- Step 1: Add column to store maximum user level ever achieved (permanent)
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS max_user_level integer DEFAULT 0;

-- Step 2: Initialize max_user_level with current user_level for all users
UPDATE profiles 
SET max_user_level = GREATEST(COALESCE(user_level, 0), COALESCE(max_user_level, 0));

-- Step 3: Update the level recalculation function with proper persistence
CREATE OR REPLACE FUNCTION public.recalculate_single_user_level(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _profile record;
  _new_user_level integer := 0;
  _new_host_level integer := 0;
  _current_user_level integer := 0;
  _max_user_level integer := 0;
  _user_topup_total numeric;
BEGIN
  -- Get current profile data
  SELECT * INTO _profile FROM profiles WHERE id = _user_id;
  
  IF _profile IS NULL THEN
    RETURN;
  END IF;

  -- Get current and max user level (we will never decrease below max)
  _current_user_level := COALESCE(_profile.user_level, 0);
  _max_user_level := GREATEST(COALESCE(_profile.max_user_level, 0), _current_user_level);
  
  -- Calculate user level based on total topup (coins + total_consumption)
  _user_topup_total := COALESCE(_profile.coins, 0) + COALESCE(_profile.total_consumption, 0);
  
  SELECT COALESCE(level_number, 0) INTO _new_user_level
  FROM user_level_tiers
  WHERE tier_type = 'user'
    AND is_active = true
    AND min_topup_amount <= _user_topup_total
  ORDER BY level_number DESC
  LIMIT 1;

  _new_user_level := COALESCE(_new_user_level, 0);
  
  -- USER LEVEL NEVER DECREASES - use the highest ever achieved
  -- Compare with BOTH current level and max_user_level
  _new_user_level := GREATEST(_new_user_level, _current_user_level, _max_user_level);
  
  -- Update max_user_level if new level is higher
  _max_user_level := GREATEST(_new_user_level, _max_user_level);
  
  -- For hosts, calculate level based on WEEKLY earnings (this CAN reset)
  IF _profile.is_host = true THEN
    SELECT COALESCE(level_number, 0) INTO _new_host_level
    FROM user_level_tiers
    WHERE tier_type = 'host'
      AND is_active = true
      AND min_earning_amount <= COALESCE(_profile.weekly_earnings, 0)
    ORDER BY level_number DESC
    LIMIT 1;
    
    _new_host_level := COALESCE(_new_host_level, 0);
  END IF;

  -- Update the profile with both user_level and max_user_level
  UPDATE profiles
  SET 
    user_level = _new_user_level,
    max_user_level = _max_user_level,
    host_level = _new_host_level
  WHERE id = _user_id;
  
END;
$$;

-- Step 4: Recalculate all users to apply the fix
DO $$
DECLARE
  _user_record record;
BEGIN
  FOR _user_record IN SELECT id FROM profiles LOOP
    PERFORM recalculate_single_user_level(_user_record.id);
  END LOOP;
END;
$$;