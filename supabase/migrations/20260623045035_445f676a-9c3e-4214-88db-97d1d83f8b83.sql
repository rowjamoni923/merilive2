
-- 1) Allow service-side / trigger-side inserts (no auth.uid()) to bypass the
--    restricted-type guard. Real users always have auth.uid() set, so this
--    cannot be abused from the client.
CREATE OR REPLACE FUNCTION public.tg_guard_notifications_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_role_legacy text := current_setting('request.jwt.claim.role', true);
  v_claims_raw text := current_setting('request.jwt.claims', true);
  v_role_new text := NULL;
  v_bypass boolean := COALESCE(current_setting('app.bypass_profile_protection', true), '') = 'true';
  v_is_service boolean := false;
  v_auth uuid := auth.uid();
BEGIN
  IF v_claims_raw IS NOT NULL AND v_claims_raw <> '' THEN
    BEGIN
      v_role_new := (v_claims_raw::jsonb) ->> 'role';
    EXCEPTION WHEN OTHERS THEN
      v_role_new := NULL;
    END;
  END IF;

  v_is_service := v_role_legacy = 'service_role'
               OR v_role_new = 'service_role'
               OR session_user = 'service_role'
               OR current_user = 'service_role'
               -- Edge functions invoked with service role key sometimes do not
               -- propagate request.jwt.claims (no PostgREST middleware). In
               -- that path auth.uid() is NULL — a reliable indicator that the
               -- insert is server-side, since every real user request carries
               -- a signed JWT with a sub claim.
               OR v_auth IS NULL;

  IF v_is_service OR v_bypass OR public.is_active_admin_session() THEN
    IF char_length(coalesce(NEW.title,'')) > 200 THEN NEW.title := substr(NEW.title,1,200); END IF;
    IF char_length(coalesce(NEW.message,'')) > 2000 THEN NEW.message := substr(NEW.message,1,2000); END IF;
    RETURN NEW;
  END IF;

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
    'welcome_bonus'
  ) OR NEW.type LIKE 'pk\_%' ESCAPE '\' THEN
    RAISE EXCEPTION 'restricted_notification_type';
  END IF;
  IF char_length(coalesce(NEW.title,'')) > 200 THEN NEW.title := substr(NEW.title,1,200); END IF;
  IF char_length(coalesce(NEW.message,'')) > 2000 THEN NEW.message := substr(NEW.message,1,2000); END IF;
  RETURN NEW;
END;
$function$;

-- 2) Surface host_availability=offline/busy in the pre-flight check so the
--    UI can disable the Call button before the user taps it. The real write
--    inside start_private_call already enforces this; here we just make the
--    pre-flight consistent with the final gate.
CREATE OR REPLACE FUNCTION public.can_initiate_private_call(p_caller_id uuid, p_host_id uuid, p_context_stream_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _enabled text;
  _caller_is_live_host boolean;
  _receiver_ok boolean;
  _receiver_avail text;
  _caller_balance integer;
  _coins_per_minute integer;
  _host_in_call boolean;
  _host_live boolean;
  _blocked_pair boolean;
BEGIN
  IF p_caller_id IS NULL OR p_host_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'missing_ids');
  END IF;

  IF auth.uid() IS NULL OR auth.uid() <> p_caller_id THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  END IF;

  IF p_caller_id = p_host_id THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'cannot_call_self');
  END IF;

  SELECT setting_value INTO _enabled FROM public.app_settings WHERE setting_key = 'private_calls_enabled' LIMIT 1;
  IF _enabled IS NOT NULL AND btrim(_enabled) <> '' AND lower(btrim(_enabled)) NOT IN ('true','1','yes','on') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'private_calls_disabled');
  END IF;

  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_caller_id AND is_host = true AND lower(COALESCE(host_status,'')) = 'approved' AND COALESCE(is_face_verified,false) = true) INTO _caller_is_live_host;
  IF COALESCE(_caller_is_live_host, false) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'hosts_cannot_initiate_user_calls');
  END IF;

  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_host_id AND is_host = true AND lower(COALESCE(host_status,'')) = 'approved' AND COALESCE(is_face_verified,false) = true) INTO _receiver_ok;
  IF NOT COALESCE(_receiver_ok, false) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'receiver_not_callable_host');
  END IF;

  -- NEW: surface offline / busy before any other expensive checks so the UI
  -- can disable the Call button immediately. Mirrors the gate inside
  -- start_private_call so behaviour is consistent on both sides.
  SELECT lower(COALESCE(host_availability, 'online')) INTO _receiver_avail
    FROM public.profiles WHERE id = p_host_id;
  IF _receiver_avail = 'offline' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'host_offline');
  ELSIF _receiver_avail = 'busy' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'host_busy');
  END IF;

  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = p_caller_id AND COALESCE(is_blocked,false) = true)
     OR EXISTS (SELECT 1 FROM public.profiles WHERE id = p_host_id AND COALESCE(is_blocked,false) = true) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'account_blocked');
  END IF;

  SELECT EXISTS (SELECT 1 FROM public.blocked_users WHERE (blocker_id = p_caller_id AND blocked_id = p_host_id) OR (blocker_id = p_host_id AND blocked_id = p_caller_id))
      OR EXISTS (SELECT 1 FROM public.user_blocks WHERE (blocker_id = p_caller_id AND blocked_id = p_host_id) OR (blocker_id = p_host_id AND blocked_id = p_caller_id))
    INTO _blocked_pair;
  IF COALESCE(_blocked_pair,false) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'user_blocked');
  END IF;

  SELECT COALESCE(is_in_call,false) INTO _host_in_call FROM public.profiles WHERE id = p_host_id;
  IF COALESCE(_host_in_call,false) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'host_busy_in_call');
  END IF;

  IF p_context_stream_id IS NULL THEN
    SELECT EXISTS (SELECT 1 FROM public.live_streams ls WHERE ls.host_id = p_host_id AND ls.ended_at IS NULL AND COALESCE(ls.is_active,true) = true AND lower(COALESCE(ls.status,'active')) = 'active') INTO _host_live;
    IF COALESCE(_host_live,false) THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'host_busy_live');
    END IF;
  ELSE
    IF NOT EXISTS (SELECT 1 FROM public.live_streams ls WHERE ls.id = p_context_stream_id AND ls.host_id = p_host_id AND ls.ended_at IS NULL AND COALESCE(ls.is_active,true) = true AND lower(COALESCE(ls.status,'active')) = 'active') THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'invalid_stream_context');
    END IF;
  END IF;

  _coins_per_minute := public._resolve_private_call_coins_per_minute(p_host_id);

  SELECT COALESCE(coins,0)::integer INTO _caller_balance FROM public.profiles WHERE id = p_caller_id;
  IF _caller_balance IS NULL OR _caller_balance < _coins_per_minute THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'insufficient_balance', 'required', _coins_per_minute, 'current', COALESCE(_caller_balance,0));
  END IF;

  RETURN jsonb_build_object('ok', true, 'coins_per_minute', _coins_per_minute, 'caller_balance', _caller_balance);
END;
$function$;
