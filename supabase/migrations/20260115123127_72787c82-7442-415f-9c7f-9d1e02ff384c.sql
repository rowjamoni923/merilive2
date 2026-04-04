
-- Create comprehensive level update function for both users and hosts
CREATE OR REPLACE FUNCTION public.auto_update_level()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user_id UUID;
  _profile RECORD;
  _new_user_level INTEGER := 0;
  _new_host_level INTEGER := 0;
  _user_topup_total BIGINT;
BEGIN
  -- Determine user_id based on which table triggered this
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

  -- Get user profile
  SELECT id, coins, total_consumption, total_earnings, user_level, host_level, is_host, gender
  INTO _profile
  FROM profiles
  WHERE id = _user_id;

  IF _profile IS NULL THEN
    RETURN NEW;
  END IF;

  -- Calculate USER level based on total_consumption (coins spent)
  _user_topup_total := COALESCE(_profile.coins, 0) + COALESCE(_profile.total_consumption, 0);
  
  SELECT COALESCE(level_number, 0) INTO _new_user_level
  FROM user_level_tiers
  WHERE tier_type = 'user'
    AND is_active = true
    AND min_topup_amount <= _user_topup_total
  ORDER BY level_number DESC
  LIMIT 1;

  _new_user_level := COALESCE(_new_user_level, 0);

  -- Calculate HOST level based on total_earnings (only for hosts)
  IF _profile.is_host = true THEN
    SELECT COALESCE(level_number, 0) INTO _new_host_level
    FROM user_level_tiers
    WHERE tier_type = 'host'
      AND is_active = true
      AND min_earning_amount <= COALESCE(_profile.total_earnings, 0)
    ORDER BY level_number DESC
    LIMIT 1;
    
    _new_host_level := COALESCE(_new_host_level, 0);
  END IF;

  -- Update levels if changed
  IF _new_user_level != COALESCE(_profile.user_level, 0) OR 
     (_profile.is_host = true AND _new_host_level != COALESCE(_profile.host_level, 0)) THEN
    UPDATE profiles 
    SET 
      user_level = _new_user_level,
      host_level = CASE WHEN is_host = true THEN _new_host_level ELSE host_level END,
      updated_at = now()
    WHERE id = _user_id;
  END IF;

  RETURN NEW;
END;
$$;

-- Helper function to recalculate single user level
CREATE OR REPLACE FUNCTION public.recalculate_single_user_level(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _profile RECORD;
  _new_user_level INTEGER := 0;
  _new_host_level INTEGER := 0;
  _user_topup_total BIGINT;
BEGIN
  SELECT id, coins, total_consumption, total_earnings, user_level, host_level, is_host, gender
  INTO _profile
  FROM profiles
  WHERE id = p_user_id;

  IF _profile IS NULL THEN
    RETURN;
  END IF;

  -- Calculate USER level
  _user_topup_total := COALESCE(_profile.coins, 0) + COALESCE(_profile.total_consumption, 0);
  
  SELECT COALESCE(level_number, 0) INTO _new_user_level
  FROM user_level_tiers
  WHERE tier_type = 'user'
    AND is_active = true
    AND min_topup_amount <= _user_topup_total
  ORDER BY level_number DESC
  LIMIT 1;

  _new_user_level := COALESCE(_new_user_level, 0);

  -- Calculate HOST level if host
  IF _profile.is_host = true THEN
    SELECT COALESCE(level_number, 0) INTO _new_host_level
    FROM user_level_tiers
    WHERE tier_type = 'host'
      AND is_active = true
      AND min_earning_amount <= COALESCE(_profile.total_earnings, 0)
    ORDER BY level_number DESC
    LIMIT 1;
    
    _new_host_level := COALESCE(_new_host_level, 0);
  END IF;

  -- Update if changed
  UPDATE profiles 
  SET 
    user_level = _new_user_level,
    host_level = CASE WHEN is_host = true THEN _new_host_level ELSE host_level END,
    updated_at = now()
  WHERE id = p_user_id
    AND (user_level != _new_user_level OR (is_host = true AND host_level != _new_host_level));
END;
$$;

-- Drop existing triggers if any
DROP TRIGGER IF EXISTS trigger_auto_update_level_profiles ON profiles;
DROP TRIGGER IF EXISTS trigger_auto_update_level_gift ON gift_transactions;
DROP TRIGGER IF EXISTS trigger_auto_update_level_coins ON coin_transfers;
DROP TRIGGER IF EXISTS auto_level_update_on_profile ON profiles;
DROP TRIGGER IF EXISTS auto_level_update_on_gift ON gift_transactions;

-- Create trigger on profiles table (when coins, total_consumption, total_earnings change)
CREATE TRIGGER trigger_auto_update_level_profiles
  AFTER INSERT OR UPDATE OF coins, total_consumption, total_earnings, is_host
  ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION auto_update_level();

-- Create trigger on gift_transactions (when gift is sent/received)
CREATE TRIGGER trigger_auto_update_level_gift
  AFTER INSERT
  ON gift_transactions
  FOR EACH ROW
  EXECUTE FUNCTION auto_update_level();

-- Create trigger on coin_transfers (when coins are transferred)
CREATE TRIGGER trigger_auto_update_level_coins
  AFTER INSERT
  ON coin_transfers
  FOR EACH ROW
  EXECUTE FUNCTION auto_update_level();

-- Now recalculate all existing users' levels
DO $$
DECLARE
  user_record RECORD;
  _new_user_level INTEGER;
  _new_host_level INTEGER;
  _user_topup_total BIGINT;
BEGIN
  FOR user_record IN 
    SELECT id, coins, total_consumption, total_earnings, user_level, host_level, is_host 
    FROM profiles 
  LOOP
    _new_user_level := 0;
    _new_host_level := 0;
    
    -- Calculate USER level
    _user_topup_total := COALESCE(user_record.coins, 0) + COALESCE(user_record.total_consumption, 0);
    
    SELECT COALESCE(level_number, 0) INTO _new_user_level
    FROM user_level_tiers
    WHERE tier_type = 'user'
      AND is_active = true
      AND min_topup_amount <= _user_topup_total
    ORDER BY level_number DESC
    LIMIT 1;

    _new_user_level := COALESCE(_new_user_level, 0);

    -- Calculate HOST level if host
    IF user_record.is_host = true THEN
      SELECT COALESCE(level_number, 0) INTO _new_host_level
      FROM user_level_tiers
      WHERE tier_type = 'host'
        AND is_active = true
        AND min_earning_amount <= COALESCE(user_record.total_earnings, 0)
      ORDER BY level_number DESC
      LIMIT 1;
      
      _new_host_level := COALESCE(_new_host_level, 1);
    ELSE
      _new_host_level := 1;
    END IF;

    -- Update
    UPDATE profiles 
    SET 
      user_level = _new_user_level,
      host_level = _new_host_level,
      updated_at = now()
    WHERE id = user_record.id;
  END LOOP;
END $$;
