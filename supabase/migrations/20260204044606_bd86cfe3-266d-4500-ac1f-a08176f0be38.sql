-- Step 1: Add total_recharged column to profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS total_recharged BIGINT DEFAULT 0;

-- Step 2: Initialize total_recharged from existing recharge_transactions
UPDATE public.profiles p
SET total_recharged = COALESCE((
  SELECT SUM(coins_received) 
  FROM recharge_transactions rt 
  WHERE rt.user_id = p.id AND rt.status = 'completed'
), 0);

-- Step 3: Create trigger function to update total_recharged on new recharges
CREATE OR REPLACE FUNCTION public.update_total_recharged()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'completed' AND (OLD IS NULL OR OLD.status != 'completed') THEN
    UPDATE profiles 
    SET total_recharged = COALESCE(total_recharged, 0) + NEW.coins_received
    WHERE id = NEW.user_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Step 4: Create trigger on recharge_transactions
DROP TRIGGER IF EXISTS trigger_update_total_recharged ON recharge_transactions;
CREATE TRIGGER trigger_update_total_recharged
  AFTER INSERT OR UPDATE ON recharge_transactions
  FOR EACH ROW
  EXECUTE FUNCTION update_total_recharged();

-- Step 5: Update the level calculation function
-- Regular users (boys/men): Level based on total_recharged (Diamond Recharge ONLY)
-- Female hosts: Level based on total_earnings (gifts received)
CREATE OR REPLACE FUNCTION public.recalculate_user_level(_user_id uuid)
RETURNS INTEGER AS $$
DECLARE
  _user_profile RECORD;
  _new_level INTEGER;
  _points BIGINT;
BEGIN
  -- Get user profile
  SELECT * INTO _user_profile FROM profiles WHERE id = _user_id;
  
  IF NOT FOUND THEN
    RETURN 0;
  END IF;
  
  -- Determine points based on user type
  IF _user_profile.is_host = true AND _user_profile.gender = 'female' THEN
    -- Female hosts: Level based on earnings (gifts received)
    _points := COALESCE(_user_profile.total_earnings, 0);
    _new_level := CASE
      WHEN _points >= 150000000 THEN 10
      WHEN _points >= 50000000 THEN 9
      WHEN _points >= 15000000 THEN 8
      WHEN _points >= 5000000 THEN 7
      WHEN _points >= 1500000 THEN 6
      WHEN _points >= 500000 THEN 5
      WHEN _points >= 150000 THEN 4
      WHEN _points >= 50000 THEN 3
      WHEN _points >= 15000 THEN 2
      WHEN _points >= 5000 THEN 1
      ELSE 0
    END;
  ELSE
    -- REGULAR USERS (BOYS/MEN): Level ONLY based on DIAMOND RECHARGE
    -- NOT based on gifts sent or consumption!
    _points := COALESCE(_user_profile.total_recharged, 0);
    _new_level := CASE
      WHEN _points >= 30000000000 THEN 50
      WHEN _points >= 10000000000 THEN 40
      WHEN _points >= 3000000000 THEN 30
      WHEN _points >= 1000000000 THEN 20
      WHEN _points >= 300000000 THEN 10
      WHEN _points >= 100000000 THEN 9
      WHEN _points >= 30000000 THEN 8
      WHEN _points >= 10000000 THEN 7
      WHEN _points >= 3000000 THEN 6
      WHEN _points >= 1000000 THEN 5
      WHEN _points >= 300000 THEN 4
      WHEN _points >= 100000 THEN 3
      WHEN _points >= 30000 THEN 2
      WHEN _points >= 10000 THEN 1
      ELSE 0
    END;
  END IF;
  
  -- Update user level
  UPDATE profiles SET user_level = _new_level WHERE id = _user_id;
  
  RETURN _new_level;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Step 6: Update the trigger function for profiles updates
CREATE OR REPLACE FUNCTION public.update_user_level_on_earnings()
RETURNS TRIGGER AS $$
DECLARE
  _new_level INT;
  _points NUMERIC;
BEGIN
  -- Determine level type based on gender and host status
  IF NEW.is_host = true AND NEW.gender = 'female' THEN
    -- Female hosts: Level based on earnings
    _points := COALESCE(NEW.total_earnings, 0);
  ELSE
    -- Regular users (BOYS): Level based on RECHARGE ONLY
    _points := COALESCE(NEW.total_recharged, 0);
  END IF;
  
  -- Calculate new level
  IF NEW.is_host = true AND NEW.gender = 'female' THEN
    -- Host level thresholds
    _new_level := CASE
      WHEN _points >= 150000000 THEN 10
      WHEN _points >= 50000000 THEN 9
      WHEN _points >= 15000000 THEN 8
      WHEN _points >= 5000000 THEN 7
      WHEN _points >= 1500000 THEN 6
      WHEN _points >= 500000 THEN 5
      WHEN _points >= 150000 THEN 4
      WHEN _points >= 50000 THEN 3
      WHEN _points >= 15000 THEN 2
      WHEN _points >= 5000 THEN 1
      ELSE 0
    END;
    -- Update host_level for female hosts
    NEW.host_level := _new_level;
  ELSE
    -- User level thresholds (based on recharge)
    _new_level := CASE
      WHEN _points >= 30000000000 THEN 50
      WHEN _points >= 10000000000 THEN 40
      WHEN _points >= 3000000000 THEN 30
      WHEN _points >= 1000000000 THEN 20
      WHEN _points >= 300000000 THEN 10
      WHEN _points >= 100000000 THEN 9
      WHEN _points >= 30000000 THEN 8
      WHEN _points >= 10000000 THEN 7
      WHEN _points >= 3000000 THEN 6
      WHEN _points >= 1000000 THEN 5
      WHEN _points >= 300000 THEN 4
      WHEN _points >= 100000 THEN 3
      WHEN _points >= 30000 THEN 2
      WHEN _points >= 10000 THEN 1
      ELSE 0
    END;
  END IF;
  
  -- Update level if changed
  NEW.user_level := _new_level;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Step 7: Update comprehensive trigger to ONLY update user level on recharge (not gifting)
CREATE OR REPLACE FUNCTION public.update_user_level_comprehensive()
RETURNS TRIGGER AS $$
DECLARE
  target_user_id uuid;
  user_earnings bigint;
  user_recharged bigint;
  current_level int;
  new_level int := 0;
  is_female_host boolean;
BEGIN
  -- Determine the target user based on trigger source
  IF TG_TABLE_NAME = 'profiles' THEN
    target_user_id := NEW.id;
  ELSIF TG_TABLE_NAME = 'gift_transaction_logs' THEN
    -- For gift logs, only update RECEIVER (host) level, NOT sender
    target_user_id := NEW.receiver_id;
  ELSIF TG_TABLE_NAME = 'recharge_transactions' THEN
    -- For recharge, update the user who recharged
    target_user_id := NEW.user_id;
  ELSE
    RETURN NEW;
  END IF;

  -- Skip if no user id
  IF target_user_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Get user profile data
  SELECT 
    COALESCE(total_earnings, 0),
    COALESCE(total_recharged, 0),
    COALESCE(user_level, 0),
    (is_host = true AND gender = 'female')
  INTO user_earnings, user_recharged, current_level, is_female_host
  FROM profiles
  WHERE id = target_user_id;

  -- Find the appropriate level based on user type
  IF is_female_host THEN
    -- For female hosts: Level based on total earnings (gifts received)
    SELECT COALESCE(MAX(level_number), 0) INTO new_level
    FROM host_levels
    WHERE is_active = true
      AND beans_required <= user_earnings;
  ELSE
    -- For regular users (BOYS): Level ONLY based on DIAMOND RECHARGE
    -- NOT based on gifts sent!
    SELECT COALESCE(MAX(level_number), 0) INTO new_level
    FROM user_level_thresholds
    WHERE is_active = true
      AND diamonds_required <= user_recharged;
  END IF;

  -- Fallback if no level tables exist
  IF new_level IS NULL THEN
    IF is_female_host THEN
      new_level := CASE
        WHEN user_earnings >= 150000000 THEN 10
        WHEN user_earnings >= 50000000 THEN 9
        WHEN user_earnings >= 15000000 THEN 8
        WHEN user_earnings >= 5000000 THEN 7
        WHEN user_earnings >= 1500000 THEN 6
        WHEN user_earnings >= 500000 THEN 5
        WHEN user_earnings >= 150000 THEN 4
        WHEN user_earnings >= 50000 THEN 3
        WHEN user_earnings >= 15000 THEN 2
        WHEN user_earnings >= 5000 THEN 1
        ELSE 0
      END;
    ELSE
      -- User level from RECHARGE only
      new_level := CASE
        WHEN user_recharged >= 30000000000 THEN 50
        WHEN user_recharged >= 10000000000 THEN 40
        WHEN user_recharged >= 3000000000 THEN 30
        WHEN user_recharged >= 1000000000 THEN 20
        WHEN user_recharged >= 300000000 THEN 10
        WHEN user_recharged >= 100000000 THEN 9
        WHEN user_recharged >= 30000000 THEN 8
        WHEN user_recharged >= 10000000 THEN 7
        WHEN user_recharged >= 3000000 THEN 6
        WHEN user_recharged >= 1000000 THEN 5
        WHEN user_recharged >= 300000 THEN 4
        WHEN user_recharged >= 100000 THEN 3
        WHEN user_recharged >= 30000 THEN 2
        WHEN user_recharged >= 10000 THEN 1
        ELSE 0
      END;
    END IF;
  END IF;

  -- Only update if level changed
  IF new_level != current_level THEN
    UPDATE profiles 
    SET user_level = new_level,
        host_level = CASE WHEN is_female_host THEN new_level ELSE host_level END
    WHERE id = target_user_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Step 8: Remove trigger from gift_transactions for sender (only receiver should get level update)
-- The trigger should NOT update sender's level when they send gifts
DROP TRIGGER IF EXISTS trigger_update_sender_level ON gift_transactions;

-- Add comment for documentation
COMMENT ON COLUMN profiles.total_recharged IS 'Total diamonds recharged (bought) - used for USER level calculation. Regular users level up ONLY through recharge, NOT by sending gifts.';