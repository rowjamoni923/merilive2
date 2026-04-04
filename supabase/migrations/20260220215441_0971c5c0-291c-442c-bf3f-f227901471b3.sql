-- Fix 1: Update the unified level calculation trigger to use total_consumption instead of coins
CREATE OR REPLACE FUNCTION public.calculate_user_level()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$ 
DECLARE
  target_user_id UUID;
  user_consumption NUMERIC;
  user_earnings NUMERIC;
  is_female_host BOOLEAN;
  new_level INTEGER;
  current_level INTEGER;
BEGIN
  -- Determine target user based on trigger source
  IF TG_TABLE_NAME = 'profiles' THEN
    target_user_id := NEW.id;
  ELSIF TG_TABLE_NAME = 'gift_transactions' THEN
    target_user_id := NEW.sender_id;
  ELSIF TG_TABLE_NAME = 'payment_transactions' OR TG_TABLE_NAME = 'recharge_transactions' THEN
    target_user_id := NEW.user_id;
  ELSE
    target_user_id := COALESCE(NEW.sender_id, NEW.receiver_id, NEW.user_id);
  END IF;
  
  IF target_user_id IS NULL THEN
    RETURN NEW;
  END IF;
  
  -- Get user's current data
  SELECT 
    COALESCE(p.total_consumption, 0),
    COALESCE(p.total_earnings, 0),
    (p.is_host = true AND p.gender = 'female'),
    COALESCE(p.user_level, 0)
  INTO user_consumption, user_earnings, is_female_host, current_level
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
    -- For regular users, use total_consumption (total diamonds spent)
    SELECT level_number INTO new_level
    FROM user_level_tiers
    WHERE tier_type = 'user'
      AND is_active = true
      AND min_topup_amount <= user_consumption
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
$$;

-- Fix 2: Update the sender level trigger to also recalculate level after updating consumption
CREATE OR REPLACE FUNCTION public.update_sender_level_on_gift()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$ 
DECLARE
  new_consumption NUMERIC;
  new_level INTEGER;
  current_level INTEGER;
BEGIN
  -- Update total_consumption
  UPDATE profiles 
  SET total_consumption = COALESCE(total_consumption, 0) + NEW.coin_amount,
      updated_at = now() 
  WHERE id = NEW.sender_id;

  -- Get updated consumption and current level
  SELECT COALESCE(total_consumption, 0), COALESCE(user_level, 0)
  INTO new_consumption, current_level
  FROM profiles WHERE id = NEW.sender_id;

  -- Recalculate level based on total_consumption
  SELECT level_number INTO new_level
  FROM user_level_tiers
  WHERE tier_type = 'user'
    AND is_active = true
    AND min_topup_amount <= new_consumption
  ORDER BY level_number DESC
  LIMIT 1;

  new_level := COALESCE(new_level, 0);

  -- Update if changed
  IF new_level != current_level THEN
    UPDATE profiles 
    SET user_level = new_level, updated_at = now()
    WHERE id = NEW.sender_id;
  END IF;

  RETURN NEW;
END;
$$;