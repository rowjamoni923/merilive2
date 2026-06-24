CREATE OR REPLACE FUNCTION public.purchase_noble_card(_noble_card_id uuid, _auto_renew boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _user_id UUID := auth.uid();
  _card RECORD;
  _current_balance BIGINT;
  _existing RECORD;
  _new_expires TIMESTAMPTZ;
  _subscription_id UUID;
BEGIN
  IF _user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT * INTO _card FROM public.noble_cards
  WHERE id = _noble_card_id AND is_active = true
  FOR SHARE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Noble card not found or inactive');
  END IF;

  SELECT COALESCE(coins, 0) INTO _current_balance FROM public.profiles
  WHERE id = _user_id FOR UPDATE;

  IF _current_balance IS NULL OR _current_balance < _card.monthly_diamond_cost THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Insufficient diamonds',
      'required', _card.monthly_diamond_cost,
      'current', COALESCE(_current_balance, 0)
    );
  END IF;

  SELECT * INTO _existing FROM public.user_noble_subscriptions
  WHERE user_id = _user_id
    AND noble_card_id = _noble_card_id
    AND is_active = true
    AND expires_at > now()
  ORDER BY expires_at DESC
  LIMIT 1
  FOR UPDATE;

  PERFORM set_config('app.bypass_profile_protection', 'true', true);

  UPDATE public.profiles
  SET coins = COALESCE(coins, 0) - _card.monthly_diamond_cost,
      updated_at = now()
  WHERE id = _user_id;

  IF _existing.id IS NOT NULL THEN
    _new_expires := _existing.expires_at + (_card.duration_days || ' days')::INTERVAL;
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

    _new_expires := now() + (_card.duration_days || ' days')::INTERVAL;
    INSERT INTO public.user_noble_subscriptions (
      user_id, noble_card_id, started_at, expires_at,
      is_active, auto_renew, diamonds_spent
    ) VALUES (
      _user_id, _noble_card_id, now(), _new_expires,
      true, _auto_renew, _card.monthly_diamond_cost
    ) RETURNING id INTO _subscription_id;
  END IF;

  IF _card.monthly_free_diamonds > 0 THEN
    UPDATE public.profiles
    SET coins = COALESCE(coins, 0) + _card.monthly_free_diamonds,
        updated_at = now()
    WHERE id = _user_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'subscription_id', _subscription_id,
    'rank_code', _card.rank_code,
    'rank_name', _card.rank_name,
    'expires_at', _new_expires,
    'diamonds_spent', _card.monthly_diamond_cost,
    'free_diamonds_credited', _card.monthly_free_diamonds
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.claim_vip_daily_reward()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _user_id UUID := auth.uid();
  _today DATE := CURRENT_DATE;
  _vip_tier RECORD;
  _noble_card RECORD;
  _vip_diamonds INTEGER := 0;
  _noble_diamonds INTEGER := 0;
  _total INTEGER := 0;
  _claimed_sources TEXT[] := ARRAY[]::TEXT[];
BEGIN
  IF _user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT vt.id, vt.daily_free_diamonds, vt.tier_name INTO _vip_tier
  FROM public.user_vip_subscriptions uvs
  JOIN public.vip_tiers vt ON vt.id = uvs.vip_tier_id
  WHERE uvs.user_id = _user_id
    AND uvs.is_active = true
    AND (uvs.expires_at IS NULL OR uvs.expires_at > now())
    AND vt.daily_free_diamonds > 0
  ORDER BY vt.tier_level DESC
  LIMIT 1;

  IF _vip_tier.id IS NOT NULL THEN
    BEGIN
      INSERT INTO public.vip_daily_rewards_log (user_id, claim_date, source_type, source_id, diamonds_awarded)
      VALUES (_user_id, _today, 'vip_tier', _vip_tier.id, _vip_tier.daily_free_diamonds);
      _vip_diamonds := _vip_tier.daily_free_diamonds;
      _claimed_sources := array_append(_claimed_sources, 'vip_tier:' || _vip_tier.tier_name);
    EXCEPTION WHEN unique_violation THEN
      _vip_diamonds := 0;
    END;
  END IF;

  SELECT nc.id, nc.daily_free_diamonds, nc.rank_name INTO _noble_card
  FROM public.user_noble_subscriptions uns
  JOIN public.noble_cards nc ON nc.id = uns.noble_card_id
  WHERE uns.user_id = _user_id
    AND uns.is_active = true
    AND uns.expires_at > now()
    AND nc.daily_free_diamonds > 0
  ORDER BY nc.rank_order DESC
  LIMIT 1;

  IF _noble_card.id IS NOT NULL THEN
    BEGIN
      INSERT INTO public.vip_daily_rewards_log (user_id, claim_date, source_type, source_id, diamonds_awarded)
      VALUES (_user_id, _today, 'noble_card', _noble_card.id, _noble_card.daily_free_diamonds);
      _noble_diamonds := _noble_card.daily_free_diamonds;
      _claimed_sources := array_append(_claimed_sources, 'noble_card:' || _noble_card.rank_name);
    EXCEPTION WHEN unique_violation THEN
      _noble_diamonds := 0;
    END;
  END IF;

  _total := _vip_diamonds + _noble_diamonds;

  IF _total > 0 THEN
    PERFORM set_config('app.bypass_profile_protection', 'true', true);
    UPDATE public.profiles
    SET coins = COALESCE(coins, 0) + _total, updated_at = now()
    WHERE id = _user_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'total_diamonds_awarded', _total,
    'vip_diamonds', _vip_diamonds,
    'noble_diamonds', _noble_diamonds,
    'sources', _claimed_sources,
    'already_claimed', (_vip_tier.id IS NOT NULL OR _noble_card.id IS NOT NULL) AND _total = 0
  );
END;
$function$;