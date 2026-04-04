-- Enable REPLICA IDENTITY FULL for real-time updates on key tables
ALTER TABLE recharge_transactions REPLICA IDENTITY FULL;
ALTER TABLE payment_transactions REPLICA IDENTITY FULL;
ALTER TABLE helper_transactions REPLICA IDENTITY FULL;
ALTER TABLE agency_diamond_transactions REPLICA IDENTITY FULL;
ALTER TABLE helper_orders REPLICA IDENTITY FULL;
ALTER TABLE agencies REPLICA IDENTITY FULL;
ALTER TABLE agency_hosts REPLICA IDENTITY FULL;
ALTER TABLE gift_transaction_logs REPLICA IDENTITY FULL;
ALTER TABLE banners REPLICA IDENTITY FULL;
ALTER TABLE avatar_frames REPLICA IDENTITY FULL;
ALTER TABLE gifts REPLICA IDENTITY FULL;
ALTER TABLE coin_packages REPLICA IDENTITY FULL;
ALTER TABLE topup_helpers REPLICA IDENTITY FULL;
ALTER TABLE agency_withdrawals REPLICA IDENTITY FULL;

-- Add tables to realtime publication (only new ones, skip if already exists)
DO $$
BEGIN
  -- Try to add each table, ignore if already exists
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE recharge_transactions; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE payment_transactions; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE helper_transactions; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE agency_diamond_transactions; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE helper_orders; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE agencies; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE agency_hosts; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE gift_transaction_logs; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE banners; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE avatar_frames; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE gifts; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE coin_packages; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE topup_helpers; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE agency_withdrawals; EXCEPTION WHEN OTHERS THEN NULL; END;
END $$;

-- Create function to update user level when coins are added
CREATE OR REPLACE FUNCTION update_user_level_on_coin_change()
RETURNS TRIGGER AS $$
DECLARE
  user_consumption NUMERIC;
  user_earnings NUMERIC;
  is_female_host BOOLEAN;
  new_level INTEGER;
  tier_type_val TEXT;
BEGIN
  -- Get user's current consumption and earnings
  SELECT 
    COALESCE(total_consumption, 0),
    COALESCE(total_earnings, 0),
    (is_host = true AND gender = 'female')
  INTO user_consumption, user_earnings, is_female_host
  FROM profiles
  WHERE id = NEW.user_id;
  
  -- Determine tier type
  tier_type_val := CASE WHEN is_female_host THEN 'host' ELSE 'user' END;
  
  -- Find the appropriate level
  SELECT level_number INTO new_level
  FROM user_level_tiers
  WHERE tier_type = tier_type_val
    AND is_active = true
    AND (
      (tier_type_val = 'host' AND min_earning_amount <= user_earnings) OR
      (tier_type_val = 'user' AND min_topup_amount <= user_consumption)
    )
  ORDER BY level_number DESC
  LIMIT 1;
  
  -- Update user level if changed
  IF new_level IS NOT NULL THEN
    UPDATE profiles
    SET user_level = new_level
    WHERE id = NEW.user_id AND (user_level IS NULL OR user_level < new_level);
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for recharge transactions
DROP TRIGGER IF EXISTS trigger_update_level_on_recharge ON recharge_transactions;
CREATE TRIGGER trigger_update_level_on_recharge
  AFTER INSERT OR UPDATE ON recharge_transactions
  FOR EACH ROW
  WHEN (NEW.status = 'completed')
  EXECUTE FUNCTION update_user_level_on_coin_change();

-- Create trigger for payment transactions  
DROP TRIGGER IF EXISTS trigger_update_level_on_payment ON payment_transactions;
CREATE TRIGGER trigger_update_level_on_payment
  AFTER INSERT OR UPDATE ON payment_transactions
  FOR EACH ROW
  WHEN (NEW.status = 'completed')
  EXECUTE FUNCTION update_user_level_on_coin_change();

-- Update consumption when recharge is completed
CREATE OR REPLACE FUNCTION update_consumption_on_recharge()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status != 'completed') THEN
    UPDATE profiles
    SET 
      total_consumption = COALESCE(total_consumption, 0) + NEW.coins_received,
      coins = COALESCE(coins, 0) + NEW.coins_received
    WHERE id = NEW.user_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_update_consumption_on_recharge ON recharge_transactions;
CREATE TRIGGER trigger_update_consumption_on_recharge
  AFTER INSERT OR UPDATE ON recharge_transactions
  FOR EACH ROW
  EXECUTE FUNCTION update_consumption_on_recharge();