
-- Backfill room_name FIRST (must happen before guard trigger exists)
UPDATE public.live_streams
   SET room_name = 'live_' || id::text
 WHERE room_name IS NULL OR room_name = '';

-- 1) Hide sensitive columns on live_streams from anon/authenticated
DO $$
DECLARE c text;
BEGIN
  FOREACH c IN ARRAY ARRAY[
    'stream_key','rtmp_url','ingress_id','ingress_type',
    'live_password_hash','egress_id','hls_egress_id',
    'recording_status','room_name'
  ] LOOP
    EXECUTE format(
      'REVOKE SELECT (%I) ON public.live_streams FROM anon, authenticated', c
    );
  END LOOP;
END $$;

-- 2) Guard trigger
CREATE OR REPLACE FUNCTION public.guard_live_stream_fields()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF current_setting('request.jwt.claim.role', true) = 'service_role' THEN RETURN NEW; END IF;
  IF public.is_active_admin_session() THEN RETURN NEW; END IF;
  IF public.is_admin(auth.uid()) THEN RETURN NEW; END IF;

  IF NEW.host_id IS DISTINCT FROM OLD.host_id THEN RAISE EXCEPTION 'live_stream.host_id is immutable'; END IF;
  IF NEW.started_at IS DISTINCT FROM OLD.started_at THEN RAISE EXCEPTION 'live_stream.started_at is admin-only'; END IF;
  IF NEW.viewer_count IS DISTINCT FROM OLD.viewer_count THEN RAISE EXCEPTION 'live_stream.viewer_count is server-managed'; END IF;
  IF NEW.total_coins_earned IS DISTINCT FROM OLD.total_coins_earned THEN RAISE EXCEPTION 'live_stream.total_coins_earned is server-managed'; END IF;
  IF NEW.total_gifts IS DISTINCT FROM OLD.total_gifts THEN RAISE EXCEPTION 'live_stream.total_gifts is server-managed'; END IF;
  IF NEW.live_privacy IS DISTINCT FROM OLD.live_privacy THEN RAISE EXCEPTION 'live_stream.live_privacy can only be set at start'; END IF;
  IF NEW.live_password_hash IS DISTINCT FROM OLD.live_password_hash THEN RAISE EXCEPTION 'live_stream.live_password_hash can only be set at start'; END IF;
  IF NEW.stream_key IS DISTINCT FROM OLD.stream_key OR NEW.rtmp_url IS DISTINCT FROM OLD.rtmp_url
     OR NEW.ingress_id IS DISTINCT FROM OLD.ingress_id OR NEW.ingress_type IS DISTINCT FROM OLD.ingress_type THEN
    RAISE EXCEPTION 'live_stream RTMP/ingress fields are server-managed'; END IF;
  IF NEW.hls_egress_id IS DISTINCT FROM OLD.hls_egress_id OR NEW.hls_playlist_url IS DISTINCT FROM OLD.hls_playlist_url
     OR NEW.hls_status IS DISTINCT FROM OLD.hls_status OR NEW.egress_id IS DISTINCT FROM OLD.egress_id
     OR NEW.recording_status IS DISTINCT FROM OLD.recording_status THEN
    RAISE EXCEPTION 'live_stream HLS/egress fields are server-managed'; END IF;
  IF NEW.room_name IS DISTINCT FROM OLD.room_name THEN RAISE EXCEPTION 'live_stream.room_name is immutable'; END IF;
  IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status NOT IN ('live','ended','starting') THEN
    RAISE EXCEPTION 'live_stream.status invalid value: %', NEW.status; END IF;
  IF NEW.category_id IS DISTINCT FROM OLD.category_id THEN RAISE EXCEPTION 'live_stream.category_id can only be set at start'; END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_live_stream_fields ON public.live_streams;
CREATE TRIGGER trg_guard_live_stream_fields
  BEFORE UPDATE ON public.live_streams
  FOR EACH ROW EXECUTE FUNCTION public.guard_live_stream_fields();

-- 3) stream_chat INSERT — live-ban gate
DROP POLICY IF EXISTS "Users can send chat to active streams" ON public.stream_chat;
CREATE POLICY "Users can send chat to active streams"
  ON public.stream_chat FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND NOT public.is_user_live_banned(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.live_streams ls
      WHERE ls.id = stream_chat.stream_id
        AND COALESCE(ls.is_active, true) = true
        AND ls.ended_at IS NULL
    )
  );

-- 4) stream_viewers INSERT/UPDATE — live-ban + privacy gate
DROP POLICY IF EXISTS "Users can enter active live streams" ON public.stream_viewers;
CREATE POLICY "Users can enter active live streams"
  ON public.stream_viewers FOR INSERT TO authenticated
  WITH CHECK (
    viewer_id = auth.uid()
    AND NOT public.is_user_live_banned(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.live_streams ls
      WHERE ls.id = stream_viewers.stream_id
        AND COALESCE(ls.is_active, true) = true
        AND ls.ended_at IS NULL
        AND (COALESCE(ls.live_privacy,'public') = 'public' OR ls.host_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users can update own live stream presence" ON public.stream_viewers;
CREATE POLICY "Users can update own live stream presence"
  ON public.stream_viewers FOR UPDATE TO authenticated
  USING (viewer_id = auth.uid())
  WITH CHECK (viewer_id = auth.uid() AND NOT public.is_user_live_banned(auth.uid()));

-- 5) verify_live_stream_password
CREATE OR REPLACE FUNCTION public.verify_live_stream_password(
  p_stream_id uuid, p_password text
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, extensions AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.live_streams
    WHERE id = p_stream_id
      AND COALESCE(is_active, false) = true
      AND ended_at IS NULL
      AND live_privacy = 'password'
      AND live_password_hash IS NOT NULL
      AND live_password_hash = extensions.crypt(coalesce(p_password,''), live_password_hash)
  );
$$;
REVOKE ALL ON FUNCTION public.verify_live_stream_password(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verify_live_stream_password(uuid, text) TO authenticated, service_role;

-- 6) enter_live_stream
CREATE OR REPLACE FUNCTION public.enter_live_stream(
  p_stream_id uuid, p_password text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
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

  UPDATE public.live_streams SET viewer_count = v_count WHERE id = p_stream_id;
  RETURN jsonb_build_object('success', true, 'viewer_count', v_count);
END;
$$;
REVOKE ALL ON FUNCTION public.enter_live_stream(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.enter_live_stream(uuid, text) TO authenticated, service_role;

-- 7) One active stream per host (defense in depth)
CREATE UNIQUE INDEX IF NOT EXISTS uniq_live_streams_one_active_per_host
  ON public.live_streams(host_id) WHERE COALESCE(is_active, false) = true AND ended_at IS NULL;

-- 8) Auto-populate room_name on insert
CREATE OR REPLACE FUNCTION public.tg_live_streams_set_room_name()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.room_name IS NULL OR NEW.room_name = '' THEN
    NEW.room_name := 'live_' || NEW.id::text;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_live_streams_set_room_name ON public.live_streams;
CREATE TRIGGER trg_live_streams_set_room_name
  BEFORE INSERT ON public.live_streams
  FOR EACH ROW EXECUTE FUNCTION public.tg_live_streams_set_room_name();
