
-- 1. Harden apply_vip_recharge_bonus: require service_role caller
CREATE OR REPLACE FUNCTION public.apply_vip_recharge_bonus(_user_id uuid, _recharge_id uuid, _base_diamonds integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _vip_pct NUMERIC := 0;
  _noble_pct NUMERIC := 0;
  _final_pct NUMERIC := 0;
  _bonus INTEGER := 0;
  _vip_id UUID;
  _noble_id UUID;
  _source_type TEXT;
  _source_id UUID;
  _caller_role TEXT := current_setting('request.jwt.claim.role', true);
BEGIN
  -- Only trusted backend (service_role) may credit bonus diamonds.
  IF _caller_role IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'apply_vip_recharge_bonus: forbidden' USING ERRCODE = '42501';
  END IF;

  IF _user_id IS NULL OR _base_diamonds IS NULL OR _base_diamonds <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid input');
  END IF;

  SELECT vt.id, vt.recharge_bonus_percent INTO _vip_id, _vip_pct
  FROM public.user_vip_subscriptions uvs
  JOIN public.vip_tiers vt ON vt.id = uvs.vip_tier_id
  WHERE uvs.user_id = _user_id
    AND uvs.is_active = true
    AND (uvs.expires_at IS NULL OR uvs.expires_at > now())
    AND vt.recharge_bonus_percent > 0
  ORDER BY vt.recharge_bonus_percent DESC
  LIMIT 1;

  SELECT nc.id, nc.recharge_bonus_percent INTO _noble_id, _noble_pct
  FROM public.user_noble_subscriptions uns
  JOIN public.noble_cards nc ON nc.id = uns.noble_card_id
  WHERE uns.user_id = _user_id
    AND uns.is_active = true
    AND uns.expires_at > now()
    AND nc.recharge_bonus_percent > 0
  ORDER BY nc.recharge_bonus_percent DESC
  LIMIT 1;

  IF COALESCE(_noble_pct, 0) >= COALESCE(_vip_pct, 0) THEN
    _final_pct := COALESCE(_noble_pct, 0);
    _source_type := 'noble_card';
    _source_id := _noble_id;
  ELSE
    _final_pct := COALESCE(_vip_pct, 0);
    _source_type := 'vip_tier';
    _source_id := _vip_id;
  END IF;

  IF _final_pct <= 0 THEN
    RETURN jsonb_build_object('success', true, 'bonus_diamonds', 0, 'reason', 'No bonus eligible');
  END IF;

  _bonus := FLOOR(_base_diamonds * _final_pct / 100.0);

  IF _bonus > 0 THEN
    UPDATE public.profiles
    SET diamonds = diamonds + _bonus, updated_at = now()
    WHERE id = _user_id;

    INSERT INTO public.vip_recharge_bonus_log (
      user_id, recharge_id, base_diamonds, bonus_percent,
      bonus_diamonds, source_type, source_id
    ) VALUES (
      _user_id, _recharge_id, _base_diamonds, _final_pct,
      _bonus, _source_type, _source_id
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'bonus_diamonds', _bonus,
    'bonus_percent', _final_pct,
    'source_type', _source_type
  );
END;
$function$;

-- 2. Harden expire_noble_subscriptions: service_role only
CREATE OR REPLACE FUNCTION public.expire_noble_subscriptions()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  expired_count INTEGER;
  _caller_role TEXT := current_setting('request.jwt.claim.role', true);
BEGIN
  IF _caller_role IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'expire_noble_subscriptions: forbidden' USING ERRCODE = '42501';
  END IF;
  UPDATE public.user_noble_subscriptions
  SET is_active = false,
      updated_at = now()
  WHERE is_active = true
    AND expires_at <= now();
  GET DIAGNOSTICS expired_count = ROW_COUNT;
  RETURN expired_count;
END;
$function$;

-- 3. Harden mark_noble_reminder_sent: service_role only
CREATE OR REPLACE FUNCTION public.mark_noble_reminder_sent(_subscription_id uuid, _reminder_type text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _caller_role TEXT := current_setting('request.jwt.claim.role', true);
BEGIN
  IF _caller_role IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'mark_noble_reminder_sent: forbidden' USING ERRCODE = '42501';
  END IF;
  UPDATE public.user_noble_subscriptions
  SET reminders_sent = reminders_sent || jsonb_build_array(_reminder_type),
      last_reminder_sent_at = now(),
      updated_at = now()
  WHERE id = _subscription_id;
END;
$function$;

-- 4. REVOKE EXECUTE from anon + authenticated on all four backend-only RPCs
REVOKE EXECUTE ON FUNCTION public.apply_vip_recharge_bonus(uuid, uuid, integer) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.expire_noble_subscriptions() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_noble_subscriptions_needing_reminder() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.mark_noble_reminder_sent(uuid, text) FROM anon, authenticated, PUBLIC;
