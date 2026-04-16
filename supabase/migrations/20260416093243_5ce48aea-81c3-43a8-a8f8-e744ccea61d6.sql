-- Add unique constraint for ON CONFLICT to work
ALTER TABLE user_vip_subscriptions 
ADD CONSTRAINT uq_user_vip_subscriptions_user_tier UNIQUE (user_id, vip_tier_id);

-- Recreate function with correct constraint reference
CREATE OR REPLACE FUNCTION public.purchase_vip_tier(
  p_user_id uuid,
  p_tier_id uuid,
  p_price_diamonds integer,
  p_tier_level integer,
  p_duration_days integer,
  p_equip_updates jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_coins integer;
  v_new_coins integer;
  v_expires_at timestamptz;
BEGIN
  IF p_price_diamonds <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid price');
  END IF;

  SELECT coins INTO v_current_coins
  FROM profiles
  WHERE id = p_user_id
  FOR UPDATE;

  IF v_current_coins IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'User not found');
  END IF;

  IF v_current_coins < p_price_diamonds THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient diamonds');
  END IF;

  v_new_coins := v_current_coins - p_price_diamonds;
  v_expires_at := now() + (p_duration_days || ' days')::interval;

  PERFORM set_config('app.bypass_profile_protection', 'true', true);

  UPDATE profiles
  SET 
    coins = v_new_coins,
    current_vip_tier_id = p_tier_id,
    vip_expires_at = v_expires_at,
    vip_tier = p_tier_level,
    equipped_frame_id = COALESCE((p_equip_updates->>'equipped_frame_id')::uuid, equipped_frame_id),
    equipped_entrance_id = COALESCE((p_equip_updates->>'equipped_entrance_id')::uuid, equipped_entrance_id),
    equipped_bubble_id = COALESCE((p_equip_updates->>'equipped_bubble_id')::uuid, equipped_bubble_id),
    previous_frame_id = COALESCE((p_equip_updates->>'previous_frame_id')::uuid, previous_frame_id),
    previous_entrance_id = COALESCE((p_equip_updates->>'previous_entrance_id')::uuid, previous_entrance_id),
    previous_bubble_id = COALESCE((p_equip_updates->>'previous_bubble_id')::uuid, previous_bubble_id)
  WHERE id = p_user_id;

  INSERT INTO user_vip_subscriptions (user_id, vip_tier_id, expires_at, is_active)
  VALUES (p_user_id, p_tier_id, v_expires_at, true)
  ON CONFLICT (user_id, vip_tier_id)
  DO UPDATE SET expires_at = v_expires_at, is_active = true;

  RETURN jsonb_build_object(
    'success', true,
    'balance_before', v_current_coins,
    'balance_after', v_new_coins,
    'expires_at', v_expires_at
  );
END;
$$;