-- Step 1: Drop dependent triggers
DROP TRIGGER IF EXISTS trigger_update_level_on_profile_change ON profiles;
DROP TRIGGER IF EXISTS trigger_update_level_on_profile ON profiles;
DROP TRIGGER IF EXISTS update_level_on_profile_change ON profiles;
DROP TRIGGER IF EXISTS trigger_auto_update_level_profiles ON profiles;

-- Step 2: Alter column types to BIGINT
ALTER TABLE profiles ALTER COLUMN beans TYPE BIGINT USING beans::BIGINT;
ALTER TABLE profiles ALTER COLUMN total_earnings TYPE BIGINT USING total_earnings::BIGINT;
ALTER TABLE profiles ALTER COLUMN total_consumption TYPE BIGINT USING total_consumption::BIGINT;

-- Step 3: Recreate triggers
CREATE TRIGGER trigger_update_level_on_profile_change
  AFTER UPDATE OF coins, total_consumption, total_earnings ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_user_level_comprehensive();

CREATE TRIGGER trigger_update_level_on_profile
  AFTER INSERT OR UPDATE OF coins, total_earnings ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_user_level_on_change();

CREATE TRIGGER update_level_on_profile_change
  BEFORE UPDATE OF total_earnings, total_consumption, pending_earnings ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_user_level_on_earnings();

CREATE TRIGGER trigger_auto_update_level_profiles
  AFTER INSERT OR UPDATE OF coins, total_consumption, total_earnings, is_host ON profiles
  FOR EACH ROW EXECUTE FUNCTION auto_update_level();

-- Step 4: Update the process_gift_transaction function with BIGINT
CREATE OR REPLACE FUNCTION process_gift_transaction(
  p_sender_id UUID,
  p_receiver_id UUID,
  p_gift_id UUID,
  p_quantity INT DEFAULT 1,
  p_stream_id UUID DEFAULT NULL,
  p_party_room_id UUID DEFAULT NULL,
  p_call_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_gift RECORD;
  v_sender RECORD;
  v_total_coins BIGINT;
  v_host_percent INT;
  v_beans_earned BIGINT;
  v_transaction_id UUID;
  v_commission_setting JSONB;
BEGIN
  -- 1. Get gift details
  SELECT id, name, coin_value, icon_url, animation_url
  INTO v_gift
  FROM gifts
  WHERE id = p_gift_id AND is_active = true;
  
  IF v_gift IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Gift not found or inactive');
  END IF;
  
  -- 2. Calculate total coins (BIGINT to prevent overflow)
  v_total_coins := v_gift.coin_value::BIGINT * p_quantity::BIGINT;
  
  IF v_total_coins <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid quantity');
  END IF;
  
  -- 3. Get sender's current balance with lock
  SELECT id, coins INTO v_sender
  FROM profiles
  WHERE id = p_sender_id
  FOR UPDATE;
  
  IF v_sender IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Sender not found');
  END IF;
  
  IF v_sender.coins < v_total_coins THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient coins', 'required', v_total_coins, 'available', v_sender.coins);
  END IF;
  
  -- 4. Get commission rate from app_settings
  SELECT setting_value INTO v_commission_setting
  FROM app_settings
  WHERE setting_key = 'gift_commission';
  
  -- Fallback to call_rates if gift_commission not set
  IF v_commission_setting IS NULL THEN
    SELECT setting_value INTO v_commission_setting
    FROM app_settings
    WHERE setting_key = 'call_rates';
  END IF;
  
  IF v_commission_setting IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Gift commission not configured in Admin Panel');
  END IF;
  
  -- Get host_percent (try multiple keys for flexibility)
  v_host_percent := COALESCE(
    (v_commission_setting->>'host_percent')::INT,
    100 - COALESCE((v_commission_setting->>'company_percent')::INT, 45),
    (v_commission_setting->>'host_commission_percent')::INT,
    55
  );
  
  IF v_host_percent <= 0 OR v_host_percent > 100 THEN
    v_host_percent := 55;
  END IF;
  
  -- Calculate beans earned (host's share)
  v_beans_earned := FLOOR((v_total_coins::NUMERIC * v_host_percent) / 100)::BIGINT;
  
  -- 5. DEDUCT coins from sender (ATOMIC)
  UPDATE profiles
  SET 
    coins = coins - v_total_coins,
    total_consumption = COALESCE(total_consumption, 0) + v_total_coins,
    updated_at = now()
  WHERE id = p_sender_id;
  
  -- 6. ADD beans to receiver (ATOMIC)
  UPDATE profiles
  SET 
    beans = COALESCE(beans, 0) + v_beans_earned,
    pending_earnings = COALESCE(pending_earnings, 0) + v_beans_earned,
    total_earnings = COALESCE(total_earnings, 0) + v_beans_earned,
    updated_at = now()
  WHERE id = p_receiver_id;
  
  -- 7. Create transaction record
  INSERT INTO gift_transactions (
    gift_id, sender_id, receiver_id, coin_amount, quantity,
    stream_id, party_room_id, call_id, created_at
  ) VALUES (
    p_gift_id, p_sender_id, p_receiver_id, v_total_coins, p_quantity,
    p_stream_id, p_party_room_id, p_call_id, now()
  )
  RETURNING id INTO v_transaction_id;
  
  -- 8. Update stream stats if applicable
  IF p_stream_id IS NOT NULL THEN
    UPDATE live_streams
    SET 
      total_gifts = COALESCE(total_gifts, 0) + 1,
      total_coins_earned = COALESCE(total_coins_earned, 0) + v_total_coins
    WHERE id = p_stream_id;
  END IF;
  
  -- 9. Return success
  RETURN jsonb_build_object(
    'success', true,
    'transaction_id', v_transaction_id,
    'coins_spent', v_total_coins,
    'beans_earned', v_beans_earned,
    'host_percent', v_host_percent,
    'gift_name', v_gift.name,
    'gift_icon_url', v_gift.icon_url,
    'gift_animation_url', v_gift.animation_url
  );
  
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;