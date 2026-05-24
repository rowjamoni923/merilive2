-- Pkg311 pass-2: harden VIP purchase and related callable RPCs

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
  uid uuid := auth.uid();
  v_tier record;
  v_profile record;
  v_current_coins bigint;
  v_new_coins bigint;
  v_price integer;
  v_duration_days integer;
  v_expires_at timestamptz;
  v_update jsonb := '{}'::jsonb;
BEGIN
  IF uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authenticated');
  END IF;

  IF p_user_id IS DISTINCT FROM uid THEN
    RETURN jsonb_build_object('success', false, 'error', 'forbidden_user_mismatch');
  END IF;

  SELECT * INTO v_tier
  FROM public.vip_tiers
  WHERE id = p_tier_id AND is_active = true
  FOR SHARE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'vip_tier_not_found');
  END IF;

  v_price := COALESCE(NULLIF(v_tier.price_diamonds::integer, 0), NULLIF(v_tier.price_monthly::integer, 0), 0);
  v_duration_days := COALESCE(v_tier.duration_days, 30);

  IF v_price <= 0 OR v_duration_days <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_vip_tier_price_or_duration');
  END IF;

  SELECT
    coins,
    equipped_frame_id,
    equipped_entrance_id,
    equipped_bubble_id,
    previous_frame_id,
    previous_entrance_id,
    previous_bubble_id
  INTO v_profile
  FROM public.profiles
  WHERE id = uid
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'profile_not_found');
  END IF;

  v_current_coins := COALESCE(v_profile.coins, 0);

  IF v_current_coins < v_price THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'insufficient_diamonds',
      'required', v_price,
      'current', v_current_coins
    );
  END IF;

  v_new_coins := v_current_coins - v_price;
  v_expires_at := now() + (v_duration_days || ' days')::interval;

  PERFORM set_config('app.bypass_profile_protection', 'true', true);

  UPDATE public.profiles
  SET
    coins = v_new_coins,
    current_vip_tier_id = v_tier.id,
    vip_expires_at = v_expires_at,
    vip_tier = COALESCE(v_tier.tier_level, 1),
    equipped_frame_id = CASE WHEN NULLIF(v_tier.frame_animation_url, '') IS NOT NULL THEN v_tier.id ELSE equipped_frame_id END,
    equipped_entrance_id = CASE WHEN NULLIF(v_tier.entry_animation_url, '') IS NOT NULL THEN v_tier.id ELSE equipped_entrance_id END,
    equipped_bubble_id = CASE WHEN NULLIF(v_tier.bubble_animation_url, '') IS NOT NULL THEN v_tier.id ELSE equipped_bubble_id END,
    previous_frame_id = CASE
      WHEN NULLIF(v_tier.frame_animation_url, '') IS NOT NULL AND v_profile.equipped_frame_id IS DISTINCT FROM v_tier.id
      THEN v_profile.equipped_frame_id
      ELSE previous_frame_id
    END,
    previous_entrance_id = CASE
      WHEN NULLIF(v_tier.entry_animation_url, '') IS NOT NULL AND v_profile.equipped_entrance_id IS DISTINCT FROM v_tier.id
      THEN v_profile.equipped_entrance_id
      ELSE previous_entrance_id
    END,
    previous_bubble_id = CASE
      WHEN NULLIF(v_tier.bubble_animation_url, '') IS NOT NULL AND v_profile.equipped_bubble_id IS DISTINCT FROM v_tier.id
      THEN v_profile.equipped_bubble_id
      ELSE previous_bubble_id
    END,
    updated_at = now()
  WHERE id = uid;

  INSERT INTO public.user_vip_subscriptions (user_id, vip_tier_id, expires_at, is_active)
  VALUES (uid, v_tier.id, v_expires_at, true)
  ON CONFLICT (user_id, vip_tier_id)
  DO UPDATE SET expires_at = EXCLUDED.expires_at, is_active = true;

  RETURN jsonb_build_object(
    'success', true,
    'balance_before', v_current_coins,
    'balance_after', v_new_coins,
    'expires_at', v_expires_at,
    'price_charged', v_price,
    'tier_level', COALESCE(v_tier.tier_level, 1)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.check_user_anti_kick(
  _target_user_id uuid,
  _moderator_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller uuid := auth.uid();
  _target_vip_level integer := 0;
  _target_noble_order integer := 0;
  _target_anti_kick boolean := false;
  _moderator_vip_level integer := 0;
  _moderator_noble_order integer := 0;
BEGIN
  IF _caller IS NULL OR _moderator_user_id IS DISTINCT FROM _caller THEN
    RETURN jsonb_build_object('protected', false, 'error', 'forbidden');
  END IF;

  SELECT MAX(vt.tier_level), bool_or(vt.anti_kick_protection)
  INTO _target_vip_level, _target_anti_kick
  FROM public.user_vip_subscriptions uvs
  JOIN public.vip_tiers vt ON vt.id = uvs.vip_tier_id
  WHERE uvs.user_id = _target_user_id
    AND uvs.is_active = true
    AND (uvs.expires_at IS NULL OR uvs.expires_at > now());

  SELECT MAX(nc.rank_order)
  INTO _target_noble_order
  FROM public.user_noble_subscriptions uns
  JOIN public.noble_cards nc ON nc.id = uns.noble_card_id
  WHERE uns.user_id = _target_user_id
    AND uns.is_active = true
    AND uns.expires_at > now()
    AND nc.anti_kick_protection = true;

  IF NOT COALESCE(_target_anti_kick, false) AND COALESCE(_target_noble_order, 0) = 0 THEN
    RETURN jsonb_build_object('protected', false);
  END IF;

  SELECT MAX(vt.tier_level) INTO _moderator_vip_level
  FROM public.user_vip_subscriptions uvs
  JOIN public.vip_tiers vt ON vt.id = uvs.vip_tier_id
  WHERE uvs.user_id = _moderator_user_id
    AND uvs.is_active = true
    AND (uvs.expires_at IS NULL OR uvs.expires_at > now());

  SELECT MAX(nc.rank_order) INTO _moderator_noble_order
  FROM public.user_noble_subscriptions uns
  JOIN public.noble_cards nc ON nc.id = uns.noble_card_id
  WHERE uns.user_id = _moderator_user_id
    AND uns.is_active = true
    AND uns.expires_at > now();

  IF COALESCE(_moderator_noble_order, 0) > COALESCE(_target_noble_order, 0)
     OR COALESCE(_moderator_vip_level, 0) > COALESCE(_target_vip_level, 0) THEN
    RETURN jsonb_build_object('protected', false, 'reason', 'Moderator outranks target');
  END IF;

  RETURN jsonb_build_object(
    'protected', true,
    'target_vip_level', _target_vip_level,
    'target_noble_order', _target_noble_order,
    'reason', 'Target has higher or equal VIP/Noble rank'
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.purchase_vip_tier(uuid, uuid, integer, integer, integer, jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.process_vip_subscription(uuid, text, jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.purchase_noble_card(uuid, boolean) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.claim_vip_daily_reward() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.check_user_anti_kick(uuid, uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.purchase_vip_tier(uuid, uuid, integer, integer, integer, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.process_vip_subscription(uuid, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.purchase_noble_card(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_vip_daily_reward() TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_user_anti_kick(uuid, uuid) TO authenticated;