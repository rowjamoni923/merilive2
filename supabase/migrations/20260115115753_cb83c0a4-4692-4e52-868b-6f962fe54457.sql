-- Drop existing function and recreate with correct logic
DROP FUNCTION IF EXISTS update_user_level_comprehensive() CASCADE;

CREATE OR REPLACE FUNCTION update_user_level_comprehensive()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_user_id uuid;
  user_coins bigint;
  user_earnings bigint;
  user_consumption bigint;
  current_level int;
  new_level int := 0;
  is_female_host boolean;
  user_topup_total bigint;
BEGIN
  -- Determine the target user based on trigger source
  IF TG_TABLE_NAME = 'profiles' THEN
    target_user_id := NEW.id;
  ELSIF TG_TABLE_NAME = 'gift_transactions' THEN
    target_user_id := NEW.sender_id;
  ELSIF TG_TABLE_NAME = 'gift_transaction_logs' THEN
    target_user_id := NEW.receiver_id;
  ELSIF TG_TABLE_NAME = 'coin_transfers' THEN
    target_user_id := NEW.receiver_id;
  ELSIF TG_TABLE_NAME = 'recharge_transactions' THEN
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
    COALESCE(coins, 0),
    COALESCE(total_earnings, 0),
    COALESCE(total_consumption, 0),
    COALESCE(user_level, 0),
    (is_host = true AND gender = 'female')
  INTO user_coins, user_earnings, user_consumption, current_level, is_female_host
  FROM profiles
  WHERE id = target_user_id;

  -- Find the appropriate level based on user type
  IF is_female_host THEN
    -- For female hosts: Level based on total earnings
    SELECT level_number INTO new_level
    FROM user_level_tiers
    WHERE tier_type = 'host'
      AND is_active = true
      AND min_earning_amount <= user_earnings
    ORDER BY level_number DESC
    LIMIT 1;
  ELSE
    -- For regular users: Level based on COINS (total topup amount represents coins they have/had)
    -- Use the HIGHER of current coins OR total_consumption (coins spent)
    -- This represents the total amount ever topped up
    user_topup_total := GREATEST(user_coins + user_consumption, user_coins, user_consumption);
    
    SELECT level_number INTO new_level
    FROM user_level_tiers
    WHERE tier_type = 'user'
      AND is_active = true
      AND min_topup_amount <= user_topup_total
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
$$;

-- Recreate triggers
DROP TRIGGER IF EXISTS trigger_update_level_on_profile_change ON profiles;
CREATE TRIGGER trigger_update_level_on_profile_change
  AFTER UPDATE OF coins, total_consumption, total_earnings ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_user_level_comprehensive();

DROP TRIGGER IF EXISTS trigger_update_level_on_gift ON gift_transactions;
CREATE TRIGGER trigger_update_level_on_gift
  AFTER INSERT ON gift_transactions
  FOR EACH ROW
  EXECUTE FUNCTION update_user_level_comprehensive();

DROP TRIGGER IF EXISTS trigger_update_level_on_gift_log ON gift_transaction_logs;
CREATE TRIGGER trigger_update_level_on_gift_log
  AFTER INSERT OR UPDATE ON gift_transaction_logs
  FOR EACH ROW
  WHEN (NEW.status = 'credited')
  EXECUTE FUNCTION update_user_level_comprehensive();

DROP TRIGGER IF EXISTS trigger_update_level_on_transfer ON coin_transfers;
CREATE TRIGGER trigger_update_level_on_transfer
  AFTER INSERT ON coin_transfers
  FOR EACH ROW
  WHEN (NEW.status = 'completed')
  EXECUTE FUNCTION update_user_level_comprehensive();

-- Function to manually recalculate and fix all user levels
CREATE OR REPLACE FUNCTION recalculate_all_user_levels()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_record RECORD;
  user_topup_total bigint;
  new_level int;
BEGIN
  FOR user_record IN 
    SELECT id, coins, total_consumption, total_earnings, user_level, is_host, gender 
    FROM profiles 
  LOOP
    IF user_record.is_host = true AND user_record.gender = 'female' THEN
      -- Female host: level based on earnings
      SELECT COALESCE(level_number, 0) INTO new_level
      FROM user_level_tiers
      WHERE tier_type = 'host'
        AND is_active = true
        AND min_earning_amount <= COALESCE(user_record.total_earnings, 0)
      ORDER BY level_number DESC
      LIMIT 1;
    ELSE
      -- Regular user: level based on total topup (coins + consumption)
      user_topup_total := GREATEST(
        COALESCE(user_record.coins, 0) + COALESCE(user_record.total_consumption, 0),
        COALESCE(user_record.coins, 0),
        COALESCE(user_record.total_consumption, 0)
      );
      
      SELECT COALESCE(level_number, 0) INTO new_level
      FROM user_level_tiers
      WHERE tier_type = 'user'
        AND is_active = true
        AND min_topup_amount <= user_topup_total
      ORDER BY level_number DESC
      LIMIT 1;
    END IF;
    
    new_level := COALESCE(new_level, 0);
    
    -- Update if level changed
    IF new_level != COALESCE(user_record.user_level, 0) THEN
      UPDATE profiles SET user_level = new_level, updated_at = now() WHERE id = user_record.id;
    END IF;
  END LOOP;
END;
$$;

-- Run the recalculation for all users immediately
SELECT recalculate_all_user_levels();