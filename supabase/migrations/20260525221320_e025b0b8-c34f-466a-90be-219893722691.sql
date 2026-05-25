CREATE OR REPLACE FUNCTION public.recover_session_by_device(p_device_id text)
RETURNS TABLE(user_id uuid, display_name text, avatar_url text, gender text, is_host boolean, recovery_email text, recovery_password text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_device_id text := left(coalesce(p_device_id, ''), 160);
BEGIN
  IF v_device_id !~ '^device_[A-Za-z0-9_:-]{6,128}$' THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    p.id AS user_id,
    p.display_name,
    p.avatar_url,
    p.gender,
    COALESCE(p.is_host, false) AS is_host,
    ('guest_' || v_device_id || '@meri.local')::text AS recovery_email,
    ('meri_' || v_device_id || '_secure')::text AS recovery_password
  FROM public.profiles p
  WHERE p.device_id = v_device_id
    AND COALESCE(p.is_deleted, false) = false
    AND COALESCE(p.is_banned, false) = false
    AND COALESCE(p.is_blocked, false) = false
    AND NOT EXISTS (
      SELECT 1 FROM public.banned_devices bd
      WHERE bd.device_id = v_device_id
        AND COALESCE(bd.is_active, true) = true
    )
  ORDER BY p.created_at DESC NULLS LAST
  LIMIT 1;
END;
$function$;

REVOKE ALL ON FUNCTION public.recover_session_by_device(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.recover_session_by_device(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.tg_guard_notifications_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_role text := current_setting('request.jwt.claim.role', true);
  v_bypass boolean := COALESCE(current_setting('app.bypass_profile_protection', true), '') = 'true';
BEGIN
  IF v_role = 'service_role' OR v_bypass OR public.is_active_admin_session() THEN
    IF char_length(coalesce(NEW.title,'')) > 200 THEN NEW.title := substr(NEW.title,1,200); END IF;
    IF char_length(coalesce(NEW.message,'')) > 2000 THEN NEW.message := substr(NEW.message,1,2000); END IF;
    RETURN NEW;
  END IF;

  -- when an end-user is inserting (auth.uid()=user_id), block dangerous bridge types
  IF NEW.type IS NULL THEN RAISE EXCEPTION 'invalid_type'; END IF;
  IF NEW.type IN (
    'incoming_call','call_received','call_missed',
    'admin_message','admin_message_reply','admin_notice','admin_warning',
    'system','security','report_resolved',
    'topup_approved','topup_rejected','withdrawal_approved','withdrawal_rejected',
    'level_upgrade_approved','level_upgrade_rejected','helper_approved','helper_rejected',
    'payroll_approved','payroll_rejected','host_approved','host_rejected',
    'gift_received','gift','coins_added','coins_received','coin_purchase_helper',
    'coin_purchase_direct','diamonds_credited','payment_completed','beans_exchanged',
    'agency_approved','agency_verification','agency_withdrawal_approved','agency_diamond_received',
    'app_sync','welcome_bonus'
  ) OR NEW.type LIKE 'pk\_%' ESCAPE '\' THEN
    RAISE EXCEPTION 'restricted_notification_type';
  END IF;
  IF char_length(coalesce(NEW.title,'')) > 200 THEN NEW.title := substr(NEW.title,1,200); END IF;
  IF char_length(coalesce(NEW.message,'')) > 2000 THEN NEW.message := substr(NEW.message,1,2000); END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.grant_welcome_bonus()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _bonus_coins INTEGER := 0;
  _bonus_diamonds INTEGER := 0;
  _msg_parts TEXT[] := ARRAY[]::TEXT[];
  _final_msg TEXT;
BEGIN
  -- Skip if already granted
  IF EXISTS (SELECT 1 FROM public.welcome_bonuses WHERE user_id = NEW.id) THEN
    RETURN NEW;
  END IF;

  -- Read admin-configured values safely
  SELECT COALESCE(NULLIF(setting_value, '')::INTEGER, 0) INTO _bonus_coins
  FROM public.app_settings WHERE setting_key = 'welcome_bonus_coins';

  SELECT COALESCE(NULLIF(setting_value, '')::INTEGER, 0) INTO _bonus_diamonds
  FROM public.app_settings WHERE setting_key = 'welcome_bonus_diamonds';

  _bonus_coins := COALESCE(_bonus_coins, 0);
  _bonus_diamonds := COALESCE(_bonus_diamonds, 0);

  -- If admin disabled bonus (both zero), exit silently
  IF _bonus_coins = 0 AND _bonus_diamonds = 0 THEN
    RETURN NEW;
  END IF;

  PERFORM set_config('app.bypass_profile_protection', 'true', true);

  IF _bonus_coins > 0 THEN
    UPDATE public.profiles SET coins = COALESCE(coins, 0) + _bonus_coins WHERE id = NEW.id;
    _msg_parts := array_append(_msg_parts, _bonus_coins || ' coins');
  END IF;

  IF _bonus_diamonds > 0 THEN
    UPDATE public.profiles SET diamonds = COALESCE(diamonds, 0) + _bonus_diamonds WHERE id = NEW.id;
    _msg_parts := array_append(_msg_parts, _bonus_diamonds || ' diamonds');
  END IF;

  INSERT INTO public.welcome_bonuses (user_id, bonus_type, bonus_amount, claimed, claimed_at)
  VALUES (NEW.id, 'welcome_bonus', _bonus_coins + _bonus_diamonds, true, now());

  _final_msg := 'Welcome! You have received ' || array_to_string(_msg_parts, ' and ') || ' as a signup bonus.';

  INSERT INTO public.notifications (user_id, type, title, message, data)
  VALUES (
    NEW.id,
    'welcome_bonus',
    '🎁 Welcome Bonus!',
    _final_msg,
    jsonb_build_object(
      'bonus_coins', _bonus_coins,
      'bonus_diamonds', _bonus_diamonds,
      'type', 'welcome_bonus'
    )
  );

  PERFORM set_config('app.bypass_profile_protection', 'false', true);
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('app.bypass_profile_protection', 'false', true);
  RAISE;
END;
$function$;