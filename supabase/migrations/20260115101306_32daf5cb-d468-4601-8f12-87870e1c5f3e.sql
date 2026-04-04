-- Create a comprehensive function to update user level based on coins/consumption/earnings
CREATE OR REPLACE FUNCTION update_user_level_comprehensive()
RETURNS TRIGGER AS $$
DECLARE
  target_user_id UUID;
  user_consumption NUMERIC;
  user_earnings NUMERIC;
  user_coins NUMERIC;
  is_female_host BOOLEAN;
  new_level INTEGER;
  tier_type_val TEXT;
  current_level INTEGER;
BEGIN
  -- Determine which user to update based on the trigger source
  IF TG_TABLE_NAME = 'profiles' THEN
    target_user_id := NEW.id;
  ELSIF TG_TABLE_NAME = 'gift_transactions' THEN
    -- Update both sender and receiver
    target_user_id := NEW.receiver_id;
  ELSIF TG_TABLE_NAME = 'gift_transaction_logs' THEN
    target_user_id := NEW.receiver_id;
  ELSIF TG_TABLE_NAME = 'payment_transactions' OR TG_TABLE_NAME = 'recharge_transactions' THEN
    target_user_id := NEW.user_id;
  ELSIF TG_TABLE_NAME = 'coin_transfers' THEN
    target_user_id := NEW.receiver_id;
  ELSE
    target_user_id := NEW.user_id;
  END IF;
  
  IF target_user_id IS NULL THEN
    RETURN NEW;
  END IF;
  
  -- Get user's current data
  SELECT 
    COALESCE(total_consumption, 0) + COALESCE(coins, 0),
    COALESCE(total_earnings, 0),
    COALESCE(coins, 0),
    (is_host = true AND gender = 'female'),
    COALESCE(user_level, 0)
  INTO user_consumption, user_earnings, user_coins, is_female_host, current_level
  FROM profiles
  WHERE id = target_user_id;
  
  -- Determine tier type
  tier_type_val := CASE WHEN is_female_host THEN 'host' ELSE 'user' END;
  
  -- Find the appropriate level based on coins for users or earnings for hosts
  IF is_female_host THEN
    SELECT level_number INTO new_level
    FROM user_level_tiers
    WHERE tier_type = 'host'
      AND is_active = true
      AND min_earning_amount <= user_earnings
    ORDER BY level_number DESC
    LIMIT 1;
  ELSE
    -- For regular users, use the higher of consumption or current coins
    SELECT level_number INTO new_level
    FROM user_level_tiers
    WHERE tier_type = 'user'
      AND is_active = true
      AND min_topup_amount <= user_consumption
    ORDER BY level_number DESC
    LIMIT 1;
  END IF;
  
  -- Default to level 0 if no match
  new_level := COALESCE(new_level, 0);
  
  -- Update user level if changed (only upgrade, never downgrade)
  IF new_level > current_level THEN
    UPDATE profiles
    SET user_level = new_level, updated_at = now()
    WHERE id = target_user_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger on profiles table when coins or earnings change
DROP TRIGGER IF EXISTS trigger_update_level_on_profile_change ON profiles;
CREATE TRIGGER trigger_update_level_on_profile_change
  AFTER UPDATE OF coins, total_consumption, total_earnings ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_user_level_comprehensive();

-- Trigger on gift_transactions (when gifts are sent)
DROP TRIGGER IF EXISTS trigger_update_level_on_gift ON gift_transactions;
CREATE TRIGGER trigger_update_level_on_gift
  AFTER INSERT ON gift_transactions
  FOR EACH ROW
  EXECUTE FUNCTION update_user_level_comprehensive();

-- Trigger on gift_transaction_logs (when gift is credited)
DROP TRIGGER IF EXISTS trigger_update_level_on_gift_log ON gift_transaction_logs;
CREATE TRIGGER trigger_update_level_on_gift_log
  AFTER INSERT OR UPDATE ON gift_transaction_logs
  FOR EACH ROW
  WHEN (NEW.status = 'credited')
  EXECUTE FUNCTION update_user_level_comprehensive();

-- Trigger on coin_transfers
DROP TRIGGER IF EXISTS trigger_update_level_on_transfer ON coin_transfers;
CREATE TRIGGER trigger_update_level_on_transfer
  AFTER INSERT ON coin_transfers
  FOR EACH ROW
  WHEN (NEW.status = 'completed')
  EXECUTE FUNCTION update_user_level_comprehensive();

-- Also update sender's level on gift transactions
CREATE OR REPLACE FUNCTION update_sender_level_on_gift()
RETURNS TRIGGER AS $$
DECLARE
  user_consumption NUMERIC;
  is_female_host BOOLEAN;
  new_level INTEGER;
  current_level INTEGER;
BEGIN
  -- Get sender's current data
  SELECT 
    COALESCE(total_consumption, 0) + COALESCE(coins, 0),
    (is_host = true AND gender = 'female'),
    COALESCE(user_level, 0)
  INTO user_consumption, is_female_host, current_level
  FROM profiles
  WHERE id = NEW.sender_id;
  
  IF NOT is_female_host THEN
    -- Find the appropriate level for sender (user type)
    SELECT level_number INTO new_level
    FROM user_level_tiers
    WHERE tier_type = 'user'
      AND is_active = true
      AND min_topup_amount <= user_consumption
    ORDER BY level_number DESC
    LIMIT 1;
    
    new_level := COALESCE(new_level, 0);
    
    IF new_level > current_level THEN
      UPDATE profiles
      SET user_level = new_level, updated_at = now()
      WHERE id = NEW.sender_id;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_update_sender_level_on_gift ON gift_transactions;
CREATE TRIGGER trigger_update_sender_level_on_gift
  AFTER INSERT ON gift_transactions
  FOR EACH ROW
  EXECUTE FUNCTION update_sender_level_on_gift();

-- Now run a one-time update for all existing users to fix their levels
DO $$
DECLARE
  user_record RECORD;
  new_level INTEGER;
  tier_type_val TEXT;
  consumption_val NUMERIC;
BEGIN
  FOR user_record IN 
    SELECT id, coins, total_consumption, total_earnings, is_host, gender, user_level
    FROM profiles
  LOOP
    -- Determine tier type
    tier_type_val := CASE WHEN user_record.is_host = true AND user_record.gender = 'female' THEN 'host' ELSE 'user' END;
    
    -- Calculate consumption
    consumption_val := COALESCE(user_record.total_consumption, 0) + COALESCE(user_record.coins, 0);
    
    -- Find the appropriate level
    IF tier_type_val = 'host' THEN
      SELECT level_number INTO new_level
      FROM user_level_tiers
      WHERE tier_type = 'host'
        AND is_active = true
        AND min_earning_amount <= COALESCE(user_record.total_earnings, 0)
      ORDER BY level_number DESC
      LIMIT 1;
    ELSE
      SELECT level_number INTO new_level
      FROM user_level_tiers
      WHERE tier_type = 'user'
        AND is_active = true
        AND min_topup_amount <= consumption_val
      ORDER BY level_number DESC
      LIMIT 1;
    END IF;
    
    new_level := COALESCE(new_level, 0);
    
    -- Update if different
    IF new_level != COALESCE(user_record.user_level, 0) THEN
      UPDATE profiles
      SET user_level = new_level
      WHERE id = user_record.id;
    END IF;
  END LOOP;
END $$;