
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
      AND coalesce(ls.last_heartbeat, ls.started_at, ls.created_at) > now() - interval '90 seconds'
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

CREATE OR REPLACE FUNCTION public.start_live_stream(
  p_title text DEFAULT NULL,
  p_thumbnail_url text DEFAULT NULL,
  p_display_name text DEFAULT NULL,
  p_category_id uuid DEFAULT NULL,
  p_live_privacy text DEFAULT 'public',
  p_password text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  uid uuid := auth.uid();
  gate jsonb;
  v_title text;
  v_mod jsonb;
  v_priv text := lower(trim(coalesce(p_live_privacy, 'public')));
  v_pw_hash text;
  v_cat_ok boolean;
  v_ul int;
  new_row public.live_streams%ROWTYPE;
BEGIN
  IF uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'auth', 'reason', 'Not authenticated.');
  END IF;

  IF v_priv NOT IN ('public', 'followers', 'password', 'pk_only') THEN
    RETURN jsonb_build_object('success', false, 'code', 'privacy', 'reason', 'Invalid privacy option.');
  END IF;

  IF v_priv = 'pk_only' THEN
    SELECT coalesce(user_level, 0) INTO v_ul FROM public.profiles WHERE id = uid;
    IF coalesce(v_ul, 0) < 10 THEN
      RETURN jsonb_build_object('success', false, 'code', 'level', 'reason', 'PK-only live requires user level 10 or higher.');
    END IF;
  END IF;

  IF v_priv = 'password' THEN
    IF p_password IS NULL OR length(trim(p_password)) < 4 THEN
      RETURN jsonb_build_object('success', false, 'code', 'password', 'reason', 'Password room requires a password of at least 4 characters.');
    END IF;
    v_pw_hash := crypt(trim(p_password), gen_salt('bf'));
  ELSE
    v_pw_hash := NULL;
  END IF;

  IF p_category_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.live_categories c
      WHERE c.id = p_category_id AND coalesce(c.is_active, true) = true
    ) INTO v_cat_ok;
    IF NOT coalesce(v_cat_ok, false) THEN
      RETURN jsonb_build_object('success', false, 'code', 'category', 'reason', 'Invalid or inactive category.');
    END IF;
  END IF;

  PERFORM set_config('app.bypass_live_stream_guard', 'on', true);
  UPDATE public.live_streams
  SET is_active = false, ended_at = COALESCE(ended_at, now()), viewer_count = 0, status = 'ended'
  WHERE host_id = uid AND (coalesce(is_active, false) = true OR ended_at IS NULL);
  PERFORM set_config('app.bypass_live_stream_guard', 'off', true);

  SELECT public.can_user_go_live() INTO gate;
  IF coalesce((gate->>'allowed')::boolean, false) IS DISTINCT FROM true THEN
    RETURN jsonb_build_object('success', false, 'code', coalesce(gate->>'code', 'denied'), 'reason', coalesce(gate->>'reason', 'Not allowed to go live.'));
  END IF;

  v_title := trim(coalesce(p_title, ''));
  IF v_title = '' THEN
    IF trim(coalesce(p_display_name, '')) <> '' THEN
      v_title := trim(p_display_name) || '''s Live';
    ELSE
      v_title := 'User''s Live';
    END IF;
  END IF;

  SELECT public.moderate_text(v_title, 'live_title') INTO v_mod;
  IF coalesce((v_mod->>'success')::boolean, false) IS DISTINCT FROM true THEN
    RETURN jsonb_build_object('success', false, 'code', coalesce(v_mod->>'code', 'moderated'), 'reason', coalesce(v_mod->>'reason', 'Title not allowed.'));
  END IF;
  v_title := coalesce(v_mod->>'clean_text', v_title);

  INSERT INTO public.live_streams (
    host_id, title, thumbnail_url, is_active, status, started_at,
    viewer_count, total_coins_earned, last_heartbeat,
    category_id, live_privacy, live_password_hash
  )
  VALUES (
    uid, v_title, nullif(trim(coalesce(p_thumbnail_url, '')), ''),
    true, 'starting', now(), 0, 0, now(),
    p_category_id, v_priv, v_pw_hash
  )
  RETURNING * INTO new_row;

  RETURN jsonb_build_object(
    'success', true,
    'stream', jsonb_build_object(
      'id', new_row.id,
      'host_id', new_row.host_id,
      'title', new_row.title,
      'viewer_count', new_row.viewer_count,
      'is_active', new_row.is_active,
      'status', new_row.status,
      'thumbnail_url', new_row.thumbnail_url,
      'started_at', new_row.started_at,
      'category_id', new_row.category_id,
      'live_privacy', new_row.live_privacy
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.cleanup_stale_live_streams()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  closed_count integer;
BEGIN
  PERFORM set_config('app.bypass_live_stream_guard', 'on', true);
  UPDATE public.live_streams
  SET is_active = false,
      ended_at = COALESCE(ended_at, now()),
      status = 'ended',
      viewer_count = 0
  WHERE COALESCE(is_active, false) = true
    AND COALESCE(last_heartbeat, started_at, created_at) < now() - interval '3 minutes';
  GET DIAGNOSTICS closed_count = ROW_COUNT;
  PERFORM set_config('app.bypass_live_stream_guard', 'off', true);
  RETURN closed_count;
END;
$$;

REVOKE ALL ON FUNCTION public.start_live_stream(text, text, text, uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_live_stream(text, text, text, uuid, text, text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.can_user_go_live() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_user_go_live() TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.cleanup_stale_live_streams() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cleanup_stale_live_streams() TO authenticated, service_role;

ALTER TABLE public.stream_recordings
  ALTER COLUMN expires_at SET DEFAULT (now() + interval '7 days');

UPDATE public.stream_recordings
SET expires_at = LEAST(expires_at, created_at + interval '7 days')
WHERE expires_at > created_at + interval '7 days';
