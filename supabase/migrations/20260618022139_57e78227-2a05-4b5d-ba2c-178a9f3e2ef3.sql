-- Phase 1A: Live status transition + orphan cleanup

-- 1) Transition status 'starting' → 'live' when the host actually joins the LiveKit room.
-- Called from livekit-webhook on participant_joined. Idempotent.
CREATE OR REPLACE FUNCTION public.mark_live_stream_live(
  _room_name text,
  _identity  text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_stream_id uuid;
  v_updated   integer;
BEGIN
  IF _room_name IS NULL OR _identity IS NULL THEN
    RETURN false;
  END IF;

  -- Room naming convention: live_<uuid>
  IF _room_name !~* '^live_[0-9a-f-]{36}$' THEN
    RETURN false;
  END IF;

  v_stream_id := substring(_room_name from 6)::uuid;

  UPDATE public.live_streams
  SET status = 'live',
      last_heartbeat = now()
  WHERE id = v_stream_id
    AND host_id::text = _identity
    AND COALESCE(is_active, false) = true
    AND lower(coalesce(status::text, '')) IN ('starting','live');

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated > 0;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_live_stream_live(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_live_stream_live(text, text) TO service_role;


-- 2) Abort a freshly-created live stream when the host's LiveKit connect fails.
-- The host (auth.uid() = host_id) calls this immediately after a connect throw.
-- Only allowed when status='starting' AND viewer_count=0 — never tears down a live room.
CREATE OR REPLACE FUNCTION public.abort_live_stream(
  p_stream_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  uid uuid := auth.uid();
  v_row public.live_streams%ROWTYPE;
  v_aborted boolean := false;
BEGIN
  IF uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'reason', 'unauthenticated');
  END IF;
  IF p_stream_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'reason', 'missing_stream_id');
  END IF;

  SELECT * INTO v_row FROM public.live_streams WHERE id = p_stream_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'reason', 'not_found');
  END IF;
  IF v_row.host_id <> uid THEN
    RETURN jsonb_build_object('success', false, 'reason', 'not_host');
  END IF;

  -- Only abort if it never actually went live (no viewers, still 'starting').
  IF COALESCE(v_row.is_active, false) = true
     AND lower(coalesce(v_row.status::text, '')) = 'starting'
     AND COALESCE(v_row.viewer_count, 0) = 0 THEN

    PERFORM set_config('app.bypass_live_stream_guard', 'on', true);
    UPDATE public.live_streams
    SET is_active = false,
        status = 'ended',
        ended_at = COALESCE(ended_at, now()),
        viewer_count = 0
    WHERE id = p_stream_id;
    PERFORM set_config('app.bypass_live_stream_guard', 'off', true);
    v_aborted := true;
  END IF;

  RETURN jsonb_build_object('success', true, 'aborted', v_aborted);
END;
$$;

REVOKE ALL ON FUNCTION public.abort_live_stream(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.abort_live_stream(uuid) TO authenticated, service_role;