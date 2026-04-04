-- Create a secure atomic function for gift transactions
-- This ensures coins are properly deducted and beans are properly added

CREATE OR REPLACE FUNCTION public.process_gift_transaction(
  p_sender_id UUID,
  p_receiver_id UUID,
  p_gift_id UUID,
  p_quantity INT,
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
  v_receiver RECORD;
  v_total_coins INT;
  v_host_percent INT;
  v_beans_earned INT;
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
  
  -- 2. Calculate total coins
  v_total_coins := v_gift.coin_value * p_quantity;
  
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
  
  -- 4. Get commission rate from app_settings (STRICT - no fallback)
  SELECT setting_value INTO v_commission_setting
  FROM app_settings
  WHERE setting_key = 'gift_commission';
  
  IF v_commission_setting IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Gift commission not configured in Admin Panel');
  END IF;
  
  -- Get host_percent from settings
  v_host_percent := COALESCE((v_commission_setting->>'host_percent')::INT, 0);
  
  IF v_host_percent <= 0 OR v_host_percent > 100 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid commission rate in Admin Panel');
  END IF;
  
  -- Calculate beans earned (host's share)
  v_beans_earned := FLOOR((v_total_coins * v_host_percent) / 100);
  
  -- 5. DEDUCT coins from sender (ATOMIC)
  UPDATE profiles
  SET coins = coins - v_total_coins,
      updated_at = now()
  WHERE id = p_sender_id;
  
  -- 6. ADD beans to receiver (ATOMIC)
  UPDATE profiles
  SET beans = COALESCE(beans, 0) + v_beans_earned,
      pending_earnings = COALESCE(pending_earnings, 0) + v_beans_earned,
      total_earnings = COALESCE(total_earnings, 0) + v_beans_earned,
      updated_at = now()
  WHERE id = p_receiver_id;
  
  -- 7. Create transaction record
  INSERT INTO gift_transactions (
    gift_id,
    sender_id,
    receiver_id,
    coin_amount,
    quantity,
    stream_id,
    party_room_id,
    call_id,
    created_at
  ) VALUES (
    p_gift_id,
    p_sender_id,
    p_receiver_id,
    v_total_coins,
    p_quantity,
    p_stream_id,
    p_party_room_id,
    p_call_id,
    now()
  )
  RETURNING id INTO v_transaction_id;
  
  -- 8. Return success with details
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

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.process_gift_transaction TO authenticated;