-- Fix 1: Remove trigger that updates sender level on gift (wrong behavior)
DROP TRIGGER IF EXISTS trigger_update_sender_level_on_gift ON gift_transactions;

-- Fix 2: Update auto_update_level to NOT update sender level on gift
CREATE OR REPLACE FUNCTION public.auto_update_level()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _user_id uuid;
BEGIN
  IF TG_TABLE_NAME = 'profiles' THEN
    _user_id := NEW.id;
    PERFORM public.recalculate_single_user_level(_user_id);
  ELSIF TG_TABLE_NAME = 'gift_transactions' THEN
    -- ONLY update RECEIVER (host) level on gift, NOT sender
    -- User level should only change via recharge
    _user_id := NEW.receiver_id;
    PERFORM public.recalculate_single_user_level(_user_id);
  ELSIF TG_TABLE_NAME = 'coin_transfers' THEN
    _user_id := NEW.receiver_id;
    PERFORM public.recalculate_single_user_level(_user_id);
  ELSE
    RETURN NEW;
  END IF;
  
  RETURN NEW;
END;
$function$;

-- Fix 3: Update recalculate_single_user_level to use total_recharged ONLY for user level
CREATE OR REPLACE FUNCTION public.recalculate_single_user_level(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _profile record;
  _new_user_level integer := 0;
  _new_host_level integer := 0;
  _current_user_level integer := 0;
  _max_user_level integer := 0;
  _user_recharge_total numeric;
BEGIN
  -- Get current profile data
  SELECT * INTO _profile FROM profiles WHERE id = _user_id;
  
  IF _profile IS NULL THEN
    RETURN;
  END IF;

  -- Get current and max user level (we will never decrease below max)
  _current_user_level := COALESCE(_profile.user_level, 0);
  _max_user_level := GREATEST(COALESCE(_profile.max_user_level, 0), _current_user_level);
  
  -- USER LEVEL ONLY based on total_recharged (NOT gifts, NOT consumption)
  _user_recharge_total := COALESCE(_profile.total_recharged, 0);
  
  SELECT COALESCE(level_number, 0) INTO _new_user_level
  FROM user_level_tiers
  WHERE tier_type = 'user'
    AND is_active = true
    AND min_topup_amount <= _user_recharge_total
  ORDER BY level_number DESC
  LIMIT 1;

  _new_user_level := COALESCE(_new_user_level, 0);
  
  -- USER LEVEL NEVER DECREASES
  _new_user_level := GREATEST(_new_user_level, _current_user_level, _max_user_level);
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

  -- Update profile
  UPDATE profiles
  SET 
    user_level = _new_user_level,
    max_user_level = _max_user_level,
    host_level = _new_host_level
  WHERE id = _user_id;
  
END;
$function$;

-- Fix 4: Also fix update_user_level_comprehensive to not fire for gift sender
-- Remove the trigger on gift_transactions for this function (it was duplicating)
DROP TRIGGER IF EXISTS trigger_update_level_on_gift ON gift_transactions;