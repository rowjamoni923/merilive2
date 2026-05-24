-- Section #11 Pass-3b: fix end-flow compatibility with anti-fraud guard
CREATE OR REPLACE FUNCTION public.guard_live_stream_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_ending boolean := COALESCE(OLD.is_active, false) = true
    AND (
      COALESCE(NEW.is_active, false) = false
      OR NEW.ended_at IS NOT NULL
      OR NEW.status = 'ended'
    );
BEGIN
  IF current_setting('request.jwt.claim.role', true) = 'service_role' THEN RETURN NEW; END IF;
  IF public.is_active_admin_session() THEN RETURN NEW; END IF;
  IF public.is_admin(auth.uid()) THEN RETURN NEW; END IF;

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

  -- Normal end transition may set ended_at/is_active/status and reset viewer_count.
  -- The close-viewers trigger normalizes viewer_count to 0 before storage.
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
$$;