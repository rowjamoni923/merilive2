-- ============================================
-- COMPLETE HOST WEEKLY LEVEL RESET SYSTEM
-- User levels are PERMANENT (never decrease)
-- Host levels reset to 0 weekly if not earning
-- ============================================

-- Step 1: Add columns to track weekly earnings for hosts
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS weekly_earnings numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS weekly_reset_at timestamp with time zone DEFAULT now();

-- Step 2: Drop existing function to allow recreation
DROP FUNCTION IF EXISTS public.recalculate_single_user_level(uuid);

-- Step 3: Create function to reset host levels weekly
CREATE OR REPLACE FUNCTION public.reset_host_levels_weekly()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Reset host_level to 0 and weekly_earnings to 0 for hosts whose weekly_reset_at is more than 7 days ago
  UPDATE profiles
  SET 
    host_level = 0,
    weekly_earnings = 0,
    weekly_reset_at = now()
  WHERE 
    is_host = true
    AND weekly_reset_at < (now() - interval '7 days');
    
  RAISE NOTICE 'Weekly host level reset completed at %', now();
END;
$$;

-- Step 4: Create function to add to weekly earnings when host receives gifts
CREATE OR REPLACE FUNCTION public.add_to_weekly_earnings()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _receiver_is_host boolean;
  _beans_amount numeric;
BEGIN
  -- Check if receiver is a host
  SELECT is_host INTO _receiver_is_host
  FROM profiles
  WHERE id = NEW.receiver_id;
  
  IF _receiver_is_host = true THEN
    -- Calculate beans (60% of coin amount goes to host)
    _beans_amount := NEW.coin_amount * 0.6;
    
    -- Add to weekly earnings
    UPDATE profiles
    SET weekly_earnings = COALESCE(weekly_earnings, 0) + _beans_amount
    WHERE id = NEW.receiver_id;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Step 5: Create trigger to track weekly earnings on gift transactions
DROP TRIGGER IF EXISTS trigger_add_weekly_earnings ON gift_transactions;
CREATE TRIGGER trigger_add_weekly_earnings
  AFTER INSERT ON gift_transactions
  FOR EACH ROW
  EXECUTE FUNCTION add_to_weekly_earnings();

-- Step 6: Create the updated level recalculation function
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
  _user_topup_total numeric;
BEGIN
  -- Get current profile data
  SELECT * INTO _profile FROM profiles WHERE id = _user_id;
  
  IF _profile IS NULL THEN
    RETURN;
  END IF;

  -- Get current user level (we will never decrease this)
  _current_user_level := COALESCE(_profile.user_level, 0);
  
  -- Calculate user level based on total topup (coins + total_consumption)
  -- User level is PERMANENT and NEVER decreases
  _user_topup_total := COALESCE(_profile.coins, 0) + COALESCE(_profile.total_consumption, 0);
  
  SELECT COALESCE(level_number, 0) INTO _new_user_level
  FROM user_level_tiers
  WHERE tier_type = 'user'
    AND is_active = true
    AND min_topup_amount <= _user_topup_total
  ORDER BY level_number DESC
  LIMIT 1;

  _new_user_level := COALESCE(_new_user_level, 0);
  
  -- USER LEVEL NEVER DECREASES - only update if new level is higher
  IF _new_user_level < _current_user_level THEN
    _new_user_level := _current_user_level;
  END IF;
  
  -- For hosts, calculate level based on WEEKLY earnings (not total)
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

  -- Update the profile
  UPDATE profiles
  SET 
    user_level = _new_user_level,
    host_level = _new_host_level
  WHERE id = _user_id;
  
END;
$$;

-- Step 7: Recreate auto_update_level function to call the new recalculate function
CREATE OR REPLACE FUNCTION public.auto_update_level()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user_id uuid;
BEGIN
  IF TG_TABLE_NAME = 'profiles' THEN
    _user_id := NEW.id;
  ELSIF TG_TABLE_NAME = 'gift_transactions' THEN
    -- Update both sender and receiver
    _user_id := NEW.receiver_id;
    -- Also update sender level
    PERFORM public.recalculate_single_user_level(NEW.sender_id);
  ELSIF TG_TABLE_NAME = 'coin_transfers' THEN
    _user_id := NEW.receiver_id;
  ELSE
    RETURN NEW;
  END IF;

  -- Recalculate level for the user
  PERFORM public.recalculate_single_user_level(_user_id);
  
  RETURN NEW;
END;
$$;

-- Step 8: Initialize weekly_earnings for existing hosts based on their earnings from the last 7 days
UPDATE profiles p
SET weekly_earnings = COALESCE(
  (SELECT SUM(gt.coin_amount * 0.6)
   FROM gift_transactions gt
   WHERE gt.receiver_id = p.id
   AND gt.created_at > (now() - interval '7 days')),
  0
),
weekly_reset_at = now()
WHERE is_host = true;

-- Step 9: Recalculate all host levels with the new weekly system
DO $$
DECLARE
  _host_record record;
BEGIN
  FOR _host_record IN SELECT id FROM profiles WHERE is_host = true LOOP
    PERFORM recalculate_single_user_level(_host_record.id);
  END LOOP;
END;
$$;