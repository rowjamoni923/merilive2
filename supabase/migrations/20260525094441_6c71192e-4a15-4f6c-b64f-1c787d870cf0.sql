-- Pkg328 single-device hardening

-- 1) Lock down check_session_valid to the authenticated owner only
CREATE OR REPLACE FUNCTION public.check_session_valid(p_user_id uuid, p_session_id text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_active_session text;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;
  IF p_session_id IS NULL OR length(p_session_id) = 0 OR length(p_session_id) > 200 THEN
    RAISE EXCEPTION 'invalid session id' USING ERRCODE = '22023';
  END IF;
  SELECT active_session_id INTO v_active_session FROM profiles WHERE id = p_user_id;
  IF v_active_session IS NULL THEN RETURN TRUE; END IF;
  RETURN v_active_session = p_session_id;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.check_session_valid(uuid, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.check_session_valid(uuid, text) TO authenticated;

-- 2) Harden update_active_session: require auth + clamp session_id length
CREATE OR REPLACE FUNCTION public.update_active_session(_session_id text, _device_info jsonb DEFAULT NULL::jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;
  IF _session_id IS NULL OR length(_session_id) = 0 OR length(_session_id) > 200 THEN
    RAISE EXCEPTION 'invalid session id' USING ERRCODE = '22023';
  END IF;

  PERFORM set_config('app.bypass_profile_protection', 'true', true);
  UPDATE profiles
     SET active_session_id = _session_id,
         last_active_at = now()
   WHERE id = v_uid;

  INSERT INTO public.user_active_sessions (user_id, session_id, device_info, updated_at)
  VALUES (v_uid, _session_id, _device_info, now())
  ON CONFLICT (user_id) DO UPDATE
    SET session_id = EXCLUDED.session_id,
        device_info = EXCLUDED.device_info,
        updated_at = now();
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.update_active_session(text, jsonb) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.update_active_session(text, jsonb) TO authenticated;