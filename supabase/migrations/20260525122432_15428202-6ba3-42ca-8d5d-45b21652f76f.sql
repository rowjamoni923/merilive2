CREATE OR REPLACE FUNCTION public.can_user_go_live()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  v_is_host boolean;
  v_face_status text;
  v_is_face_verified boolean;
  v_host_status text;
  v_is_banned boolean;
  v_is_blocked boolean;
  v_live_flag text;
  v_user_level int;
  v_host_level int;
  v_max_user_level int;
  v_current_level int;
  v_required_level int := 0;
  v_req RECORD;
BEGIN
  IF uid IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'code', 'auth', 'reason', 'Sign in required.');
  END IF;

  SELECT coalesce(p.is_host, false),
         lower(trim(coalesce(p.face_verification_status, ''))),
         coalesce(p.is_face_verified, false),
         lower(trim(coalesce(p.host_status::text, ''))),
         coalesce(p.is_banned, false),
         coalesce(p.is_blocked, false),
         coalesce(p.user_level, 0),
         coalesce(p.host_level, 0),
         coalesce(p.max_user_level, 0)
  INTO v_is_host, v_face_status, v_is_face_verified, v_host_status, v_is_banned, v_is_blocked, v_user_level, v_host_level, v_max_user_level
  FROM public.profiles p
  WHERE p.id = uid;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('allowed', false, 'code', 'profile', 'reason', 'Profile not found.');
  END IF;

  IF v_is_banned OR v_is_blocked THEN
    RETURN jsonb_build_object('allowed', false, 'code', 'account_blocked', 'reason', 'Your account cannot start live streams.');
  END IF;

  -- Face verification is mandatory, but old approved rows may have either the boolean flag OR the text status.
  IF NOT v_is_face_verified AND v_face_status IS DISTINCT FROM 'approved' THEN
    RETURN jsonb_build_object('allowed', false, 'code', 'face', 'reason', 'Face verification must be approved before going live.');
  END IF;

  IF v_is_host AND v_host_status <> 'approved' THEN
    IF v_host_status = 'agency_required' THEN
      RETURN jsonb_build_object('allowed', false, 'code', 'agency_required', 'reason', 'Join an agency before going live as a registered host.');
    END IF;
    RETURN jsonb_build_object('allowed', false, 'code', 'host_not_approved', 'reason', 'Your host approval must be active before going live.');
  END IF;

  IF public.is_user_live_banned(uid) THEN
    RETURN jsonb_build_object('allowed', false, 'code', 'banned', 'reason', 'You have an active live ban.');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.live_streams ls
    WHERE ls.host_id = uid AND ls.ended_at IS NULL
      AND (coalesce(ls.is_active, false) = true OR lower(trim(coalesce(ls.status::text, ''))) IN ('live','starting'))
  ) THEN
    RETURN jsonb_build_object('allowed', false, 'code', 'already_live', 'reason', 'You already have an active live stream.');
  END IF;

  SELECT coalesce(lower(trim(setting_value::text)), 'true') INTO v_live_flag
  FROM public.app_settings WHERE setting_key = 'live_streaming_enabled' LIMIT 1;
  IF v_live_flag IS NULL THEN v_live_flag := 'true'; END IF;
  IF v_live_flag IN ('false','0','off','no') THEN
    RETURN jsonb_build_object('allowed', false, 'code', 'disabled', 'reason', 'Live streaming is temporarily disabled.');
  END IF;

  SELECT * INTO v_req FROM public.feature_level_requirements
   WHERE feature_key = 'go_live' AND coalesce(is_active, true) = true LIMIT 1;

  IF FOUND THEN
    IF v_is_host THEN
      v_required_level := coalesce(v_req.min_level_host, v_req.min_vip_level, v_req.min_level, 0);
      v_current_level := GREATEST(v_host_level, v_user_level, v_max_user_level);
    ELSE
      v_required_level := coalesce(v_req.min_level_user, v_req.min_level, 0);
      v_current_level := GREATEST(v_user_level, v_max_user_level);
    END IF;

    IF v_current_level < v_required_level THEN
      RETURN jsonb_build_object(
        'allowed', false, 'code', 'level',
        'reason', format('You need to reach level %s to go live. Your current level is %s.', v_required_level, v_current_level),
        'required_level', v_required_level,
        'current_level', v_current_level,
        'is_host', v_is_host
      );
    END IF;
  END IF;

  RETURN jsonb_build_object('allowed', true, 'code', 'ok', 'reason', '', 'is_host', v_is_host);
END;
$$;