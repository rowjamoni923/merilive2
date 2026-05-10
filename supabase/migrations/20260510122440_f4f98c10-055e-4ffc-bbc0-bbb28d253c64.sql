CREATE OR REPLACE FUNCTION public.can_user_go_live()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  v_gender text;
  v_is_host boolean;
  v_face boolean;
  v_host_status text;
  v_live_flag text;
BEGIN
  IF uid IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'code', 'auth', 'reason', 'Sign in required.');
  END IF;

  SELECT lower(trim(coalesce(p.gender, ''))),
         coalesce(p.is_host, false),
         coalesce(p.is_face_verified, false),
         lower(trim(coalesce(p.host_status::text, '')))
    INTO v_gender, v_is_host, v_face, v_host_status
  FROM public.profiles p
  WHERE p.id = uid;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('allowed', false, 'code', 'profile', 'reason', 'Profile not found.');
  END IF;

  IF v_gender IS DISTINCT FROM 'female' THEN
    RETURN jsonb_build_object('allowed', false, 'code', 'gender', 'reason', 'Only verified female hosts can go live.');
  END IF;

  IF NOT v_is_host THEN
    RETURN jsonb_build_object('allowed', false, 'code', 'not_host', 'reason', 'Complete host onboarding and face verification first.');
  END IF;

  IF NOT v_face THEN
    RETURN jsonb_build_object('allowed', false, 'code', 'face', 'reason', 'Face verification must be approved.');
  END IF;

  IF v_is_host AND v_host_status = 'agency_required' THEN
    RETURN jsonb_build_object('allowed', false, 'code', 'agency_required', 'reason', 'Join an agency before going live as a registered host.');
  END IF;

  IF public.is_user_live_banned(uid) THEN
    RETURN jsonb_build_object('allowed', false, 'code', 'banned', 'reason', 'You have an active live ban.');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.live_streams ls
    WHERE ls.host_id = uid AND coalesce(ls.is_active, false) = true
  ) THEN
    RETURN jsonb_build_object('allowed', false, 'code', 'already_live', 'reason', 'You already have an active live stream.');
  END IF;

  SELECT coalesce(lower(trim(setting_value::text)), 'true')
    INTO v_live_flag
  FROM public.app_settings
  WHERE setting_key = 'live_streaming_enabled'
  LIMIT 1;

  IF v_live_flag IS NULL THEN
    v_live_flag := 'true';
  END IF;

  IF v_live_flag IN ('false', '0', 'off', 'no', '"false"') THEN
    RETURN jsonb_build_object('allowed', false, 'code', 'disabled', 'reason', 'Live streaming is temporarily disabled.');
  END IF;

  RETURN jsonb_build_object('allowed', true, 'code', 'ok', 'reason', '');
END;
$$;

REVOKE ALL ON FUNCTION public.can_user_go_live() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_user_go_live() FROM anon;
GRANT EXECUTE ON FUNCTION public.can_user_go_live() TO authenticated;