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
SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid := auth.uid();
  v_tier record;
  v_profile record;
  v_current_diamonds bigint;
  v_new_diamonds bigint;
  v_price integer;
  v_duration_days integer;
  v_expires_at timestamptz;
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

  SELECT diamonds,
         equipped_frame_id, equipped_entrance_id, equipped_bubble_id,
         previous_frame_id, previous_entrance_id, previous_bubble_id
    INTO v_profile
    FROM public.profiles
   WHERE id = uid
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'profile_not_found');
  END IF;

  v_current_diamonds := COALESCE(v_profile.diamonds, 0);

  IF v_current_diamonds < v_price THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'insufficient_diamonds',
      'required', v_price,
      'current', v_current_diamonds
    );
  END IF;

  v_new_diamonds := v_current_diamonds - v_price;
  v_expires_at := now() + (v_duration_days || ' days')::interval;

  PERFORM set_config('app.bypass_profile_protection', 'true', true);

  UPDATE public.profiles
     SET diamonds = v_new_diamonds,
         current_vip_tier_id = v_tier.id,
         vip_expires_at = v_expires_at,
         vip_tier = COALESCE(v_tier.tier_level, 1),
         equipped_frame_id = CASE WHEN NULLIF(v_tier.frame_animation_url, '') IS NOT NULL THEN v_tier.id ELSE equipped_frame_id END,
         equipped_entrance_id = CASE WHEN NULLIF(v_tier.entry_animation_url, '') IS NOT NULL THEN v_tier.id ELSE equipped_entrance_id END,
         equipped_bubble_id = CASE WHEN NULLIF(v_tier.bubble_animation_url, '') IS NOT NULL THEN v_tier.id ELSE equipped_bubble_id END,
         previous_frame_id = CASE
           WHEN NULLIF(v_tier.frame_animation_url, '') IS NOT NULL AND v_profile.equipped_frame_id IS DISTINCT FROM v_tier.id
           THEN v_profile.equipped_frame_id ELSE previous_frame_id END,
         previous_entrance_id = CASE
           WHEN NULLIF(v_tier.entry_animation_url, '') IS NOT NULL AND v_profile.equipped_entrance_id IS DISTINCT FROM v_tier.id
           THEN v_profile.equipped_entrance_id ELSE previous_entrance_id END,
         previous_bubble_id = CASE
           WHEN NULLIF(v_tier.bubble_animation_url, '') IS NOT NULL AND v_profile.equipped_bubble_id IS DISTINCT FROM v_tier.id
           THEN v_profile.equipped_bubble_id ELSE previous_bubble_id END,
         updated_at = now()
   WHERE id = uid;

  INSERT INTO public.user_vip_subscriptions (user_id, vip_tier_id, expires_at, is_active)
  VALUES (uid, v_tier.id, v_expires_at, true)
  ON CONFLICT (user_id, vip_tier_id)
  DO UPDATE SET expires_at = EXCLUDED.expires_at, is_active = true;

  RETURN jsonb_build_object(
    'success', true,
    'balance_before', v_current_diamonds,
    'balance_after', v_new_diamonds,
    'expires_at', v_expires_at,
    'price_charged', v_price,
    'tier_level', COALESCE(v_tier.tier_level, 1)
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.purchase_noble_card(
  _noble_card_id uuid,
  _auto_renew boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _user_id uuid := auth.uid();
  _card record;
  _current_diamonds bigint;
  _balance_after_spend bigint;
  _balance_after_credit bigint;
  _existing record;
  _new_expires timestamptz;
  _subscription_id uuid;
BEGIN
  IF _user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT * INTO _card
  FROM public.noble_cards
  WHERE id = _noble_card_id AND is_active = true
  FOR SHARE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Noble card not found or inactive');
  END IF;

  SELECT COALESCE(diamonds, 0) INTO _current_diamonds
  FROM public.profiles
  WHERE id = _user_id
  FOR UPDATE;

  IF _current_diamonds IS NULL OR _current_diamonds < _card.monthly_diamond_cost THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Insufficient diamonds',
      'required', _card.monthly_diamond_cost,
      'current', COALESCE(_current_diamonds, 0)
    );
  END IF;

  SELECT * INTO _existing
  FROM public.user_noble_subscriptions
  WHERE user_id = _user_id
    AND noble_card_id = _noble_card_id
    AND is_active = true
    AND expires_at > now()
  ORDER BY expires_at DESC
  LIMIT 1
  FOR UPDATE;

  _balance_after_spend := _current_diamonds - _card.monthly_diamond_cost;

  PERFORM set_config('app.bypass_profile_protection', 'true', true);

  UPDATE public.profiles
  SET diamonds = _balance_after_spend, updated_at = now()
  WHERE id = _user_id;

  IF _existing.id IS NOT NULL THEN
    _new_expires := _existing.expires_at + (_card.duration_days || ' days')::interval;

    UPDATE public.user_noble_subscriptions
    SET expires_at = _new_expires,
        diamonds_spent = diamonds_spent + _card.monthly_diamond_cost,
        auto_renew = _auto_renew,
        updated_at = now()
    WHERE id = _existing.id
    RETURNING id INTO _subscription_id;
  ELSE
    UPDATE public.user_noble_subscriptions
    SET is_active = false, updated_at = now()
    WHERE user_id = _user_id AND is_active = true;

    _new_expires := now() + (_card.duration_days || ' days')::interval;

    INSERT INTO public.user_noble_subscriptions (
      user_id, noble_card_id, started_at, expires_at, is_active, auto_renew, diamonds_spent
    )
    VALUES (
      _user_id, _noble_card_id, now(), _new_expires, true, _auto_renew, _card.monthly_diamond_cost
    )
    RETURNING id INTO _subscription_id;
  END IF;

  _balance_after_credit := _balance_after_spend;

  IF COALESCE(_card.monthly_free_diamonds, 0) > 0 THEN
    _balance_after_credit := _balance_after_spend + _card.monthly_free_diamonds;

    PERFORM set_config('app.bypass_profile_protection', 'true', true);

    UPDATE public.profiles
    SET diamonds = _balance_after_credit, updated_at = now()
    WHERE id = _user_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'subscription_id', _subscription_id,
    'rank_code', _card.rank_code,
    'rank_name', _card.rank_name,
    'expires_at', _new_expires,
    'diamonds_spent', _card.monthly_diamond_cost,
    'free_diamonds_credited', COALESCE(_card.monthly_free_diamonds, 0),
    'balance_before', _current_diamonds,
    'balance_after', _balance_after_credit
  );
END;
$function$;