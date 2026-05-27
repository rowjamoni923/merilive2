
-- Pkg381: SECDEF viewer-count updates blocked by guard trigger.
-- Add a session-local bypass flag honored by guard_live_stream_fields,
-- and set it inside the trusted RPCs that legitimately mutate viewer_count.

CREATE OR REPLACE FUNCTION public.guard_live_stream_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_is_ending boolean := COALESCE(OLD.is_active, false) = true
    AND (
      COALESCE(NEW.is_active, false) = false
      OR NEW.ended_at IS NOT NULL
      OR NEW.status = 'ended'
    );
  v_bypass text;
BEGIN
  IF current_setting('request.jwt.claim.role', true) = 'service_role' THEN RETURN NEW; END IF;
  IF public.is_active_admin_session() THEN RETURN NEW; END IF;
  IF public.is_admin(auth.uid()) THEN RETURN NEW; END IF;

  -- Trusted SECDEF callers (enter_live_stream / leave_live_stream / lifecycle helpers)
  -- set this flag before mutating server-managed columns.
  BEGIN
    v_bypass := current_setting('app.bypass_live_stream_guard', true);
  EXCEPTION WHEN OTHERS THEN
    v_bypass := NULL;
  END;
  IF v_bypass = 'on' THEN RETURN NEW; END IF;

  IF NEW.host_id IS DISTINCT FROM OLD.host_id THEN RAISE EXCEPTION 'live_stream.host_id is immutable'; END IF;
  IF NEW.started_at IS DISTINCT FROM OLD.started_at THEN RAISE EXCEPTION 'live_stream.started_at is admin-only'; END IF;
  IF NEW.total_coins_earned IS DISTINCT FROM OLD.total_coins_earned THEN RAISE EXCEPTION 'live_stream.total_coins_earned is server-managed'; END IF;
  IF NEW.total_gifts IS DISTINCT FROM OLD.total_gifts THEN RAISE EXCEPTION 'live_stream.total_gifts is server-managed'; END IF;
  IF NEW.live_privacy IS DISTINCT FROM OLD.live_privacy THEN RAISE EXCEPTION 'live_stream.live_privacy can only be set at start'; END IF;
  IF NEW.live_password_hash IS DISTINCT FROM OLD.live_password_hash THEN RAISE EXCEPTION 'live_stream.live_password_hash can only be set at start'; END IF;
  IF NEW.stream_key IS DISTINCT FROM OLD.stream_key OR NEW.rtmp_url IS DISTINCT FROM OLD.rtmp_url
     OR NEW.ingress_id IS DISTINCT FROM OLD.ingress_id OR NEW.ingress_type IS DISTINCT FROM OLD.ingress_type THEN
    RAISE EXCEPTION 'live_stream RTMP/ingress fields are server-managed';
  END IF;
  IF NEW.hls_egress_id IS DISTINCT FROM OLD.hls_egress_id OR NEW.hls_playlist_url IS DISTINCT FROM OLD.hls_playlist_url
     OR NEW.hls_status IS DISTINCT FROM OLD.hls_status OR NEW.egress_id IS DISTINCT FROM OLD.egress_id
     OR NEW.recording_status IS DISTINCT FROM OLD.recording_status THEN
    RAISE EXCEPTION 'live_stream HLS/egress fields are server-managed';
  END IF;
  IF NEW.room_name IS DISTINCT FROM OLD.room_name THEN RAISE EXCEPTION 'live_stream.room_name is immutable'; END IF;
  IF NEW.category_id IS DISTINCT FROM OLD.category_id THEN RAISE EXCEPTION 'live_stream.category_id can only be set at start'; END IF;

  IF NOT v_is_ending THEN
    IF NEW.viewer_count IS DISTINCT FROM OLD.viewer_count THEN RAISE EXCEPTION 'live_stream.viewer_count is server-managed'; END IF;
    IF NEW.ended_at IS DISTINCT FROM OLD.ended_at THEN RAISE EXCEPTION 'live_stream.ended_at is server-managed'; END IF;
    IF NEW.is_active IS DISTINCT FROM OLD.is_active THEN RAISE EXCEPTION 'live_stream.is_active can only change through end flow'; END IF;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status NOT IN ('live','ended','starting') THEN
    RAISE EXCEPTION 'live_stream.status invalid value: %', NEW.status;
  END IF;

  IF COALESCE(OLD.is_active, false) = false AND COALESCE(NEW.is_active, false) = true THEN
    RAISE EXCEPTION 'ended live_stream cannot be resurrected';
  END IF;

  RETURN NEW;
END;
$function$;

-- enter_live_stream: set bypass flag before the viewer_count update.
CREATE OR REPLACE FUNCTION public.enter_live_stream(p_stream_id uuid, p_password text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE uid uuid := auth.uid(); ls RECORD; v_count int;
BEGIN
  IF uid IS NULL THEN RETURN jsonb_build_object('success',false,'code','auth','reason','Sign in required.'); END IF;
  IF public.is_user_live_banned(uid) THEN
    RETURN jsonb_build_object('success',false,'code','banned','reason','You are live-banned.');
  END IF;

  SELECT id, host_id, live_privacy, live_password_hash, is_active, ended_at INTO ls
  FROM public.live_streams WHERE id = p_stream_id FOR SHARE;

  IF NOT FOUND OR COALESCE(ls.is_active,false) = false OR ls.ended_at IS NOT NULL THEN
    RETURN jsonb_build_object('success',false,'code','inactive','reason','Stream is not active.');
  END IF;

  IF ls.host_id <> uid THEN
    IF ls.live_privacy = 'password' THEN
      IF ls.live_password_hash IS NULL
         OR ls.live_password_hash <> extensions.crypt(coalesce(p_password,''), ls.live_password_hash) THEN
        RETURN jsonb_build_object('success',false,'code','password','reason','Wrong password.');
      END IF;
    ELSIF ls.live_privacy = 'followers' THEN
      IF NOT EXISTS (SELECT 1 FROM public.follows f WHERE f.follower_id = uid AND f.following_id = ls.host_id) THEN
        RETURN jsonb_build_object('success',false,'code','followers_only','reason','Follow the host to enter.');
      END IF;
    ELSIF ls.live_privacy = 'pk_only' THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.pk_battles pk
        WHERE pk.status IN ('active','accepted','starting')
          AND ((pk.host1_id = ls.host_id AND pk.host2_id = uid)
            OR (pk.host2_id = ls.host_id AND pk.host1_id = uid))
      ) THEN
        RETURN jsonb_build_object('success',false,'code','pk_only','reason','PK-only room.');
      END IF;
    END IF;
  END IF;

  INSERT INTO public.stream_viewers (stream_id, viewer_id, joined_at, left_at)
  VALUES (p_stream_id, uid, now(), NULL)
  ON CONFLICT (stream_id, viewer_id) DO UPDATE
    SET joined_at = CASE WHEN public.stream_viewers.left_at IS NULL
                         THEN public.stream_viewers.joined_at ELSE now() END,
        left_at = NULL;

  SELECT count(*)::int INTO v_count
  FROM public.stream_viewers WHERE stream_id = p_stream_id AND left_at IS NULL;

  PERFORM set_config('app.bypass_live_stream_guard', 'on', true);
  UPDATE public.live_streams SET viewer_count = v_count WHERE id = p_stream_id;
  PERFORM set_config('app.bypass_live_stream_guard', 'off', true);

  RETURN jsonb_build_object('success', true, 'viewer_count', v_count);
END;
$function$;

-- leave_live_stream_viewer: same bypass.
CREATE OR REPLACE FUNCTION public.leave_live_stream_viewer(p_stream_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_viewer_id uuid := auth.uid();
  v_count integer := 0;
BEGIN
  IF v_viewer_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  UPDATE public.stream_viewers
     SET left_at = now()
   WHERE stream_id = p_stream_id
     AND viewer_id = v_viewer_id
     AND left_at IS NULL;

  SELECT count(*)::integer
    INTO v_count
  FROM public.stream_viewers
  WHERE stream_id = p_stream_id
    AND left_at IS NULL;

  PERFORM set_config('app.bypass_live_stream_guard', 'on', true);
  UPDATE public.live_streams
     SET viewer_count = CASE WHEN ended_at IS NULL THEN v_count ELSE 0 END
   WHERE id = p_stream_id;
  PERFORM set_config('app.bypass_live_stream_guard', 'off', true);

  RETURN v_count;
END;
$function$;
