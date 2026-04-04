-- Fix the level update function to use coins directly
CREATE OR REPLACE FUNCTION public.update_user_level_on_change()
RETURNS TRIGGER AS $$
DECLARE
  target_user_id UUID;
  user_coins NUMERIC;
  user_earnings NUMERIC;
  is_female_host BOOLEAN;
  new_level INTEGER;
  current_level INTEGER;
BEGIN
  -- Determine target user based on trigger source
  IF TG_TABLE_NAME = 'profiles' THEN
    target_user_id := NEW.id;
    user_coins := COALESCE(NEW.coins, 0);
  ELSIF TG_TABLE_NAME = 'gift_transactions' THEN
    target_user_id := NEW.receiver_id;
  ELSIF TG_TABLE_NAME = 'payment_transactions' OR TG_TABLE_NAME = 'recharge_transactions' THEN
    target_user_id := NEW.user_id;
  ELSE
    target_user_id := COALESCE(NEW.receiver_id, NEW.user_id);
  END IF;
  
  IF target_user_id IS NULL THEN
    RETURN NEW;
  END IF;
  
  -- Get user's current data
  SELECT 
    COALESCE(p.coins, 0),
    COALESCE(p.total_earnings, 0),
    (p.is_host = true AND p.gender = 'female'),
    COALESCE(p.user_level, 0)
  INTO user_coins, user_earnings, is_female_host, current_level
  FROM profiles p
  WHERE p.id = target_user_id;
  
  -- Find appropriate level
  IF is_female_host THEN
    -- For female hosts, use earnings
    SELECT level_number INTO new_level
    FROM user_level_tiers
    WHERE tier_type = 'host'
      AND is_active = true
      AND min_earning_amount <= user_earnings
    ORDER BY level_number DESC
    LIMIT 1;
  ELSE
    -- For regular users, use coins (total diamonds topped up)
    SELECT level_number INTO new_level
    FROM user_level_tiers
    WHERE tier_type = 'user'
      AND is_active = true
      AND min_topup_amount <= user_coins
    ORDER BY level_number DESC
    LIMIT 1;
  END IF;
  
  new_level := COALESCE(new_level, 0);
  
  -- Update level if different
  IF new_level != current_level THEN
    UPDATE profiles
    SET user_level = new_level, updated_at = now()
    WHERE id = target_user_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Drop old triggers if they exist
DROP TRIGGER IF EXISTS trigger_update_level_on_profile ON profiles;
DROP TRIGGER IF EXISTS trigger_update_level_on_gift ON gift_transactions;
DROP TRIGGER IF EXISTS trigger_update_level_on_payment ON payment_transactions;
DROP TRIGGER IF EXISTS trigger_update_level_on_recharge ON recharge_transactions;

-- Create new triggers
CREATE TRIGGER trigger_update_level_on_profile
  AFTER INSERT OR UPDATE OF coins, total_earnings ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_user_level_on_change();

CREATE TRIGGER trigger_update_level_on_gift
  AFTER INSERT ON gift_transactions
  FOR EACH ROW
  EXECUTE FUNCTION update_user_level_on_change();

-- Now update all existing users' levels based on their coins
UPDATE profiles p
SET user_level = COALESCE(
  (SELECT MAX(t.level_number)
   FROM user_level_tiers t
   WHERE t.tier_type = CASE WHEN p.is_host = true AND p.gender = 'female' THEN 'host' ELSE 'user' END
     AND t.is_active = true
     AND (
       (p.is_host = true AND p.gender = 'female' AND t.min_earning_amount <= COALESCE(p.total_earnings, 0))
       OR
       (NOT (p.is_host = true AND p.gender = 'female') AND t.min_topup_amount <= COALESCE(p.coins, 0))
     )
  ), 0),
  updated_at = now();