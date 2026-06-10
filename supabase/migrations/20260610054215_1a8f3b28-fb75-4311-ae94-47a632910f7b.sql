-- R2-Phase E Wave-1: face attempts cap + warning-count helper

-- ─── R2-H14 ──────────────────────────────────────────────────────────────
-- Add per-row attempts counter on face_verification_submissions so the
-- expensive Rekognition pipeline can't be retried more than 3 times per
-- submission (cost guard + abuse guard).
ALTER TABLE public.face_verification_submissions
  ADD COLUMN IF NOT EXISTS rekognition_attempts integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_face_subs_status_attempts
  ON public.face_verification_submissions (status, rekognition_attempts);

-- Service-only RPC: atomically increment + return the new count.
-- Returns -1 when the row is missing (the edge fn treats as "not found").
CREATE OR REPLACE FUNCTION public.increment_face_submission_attempts(p_submission_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_count integer;
BEGIN
  UPDATE public.face_verification_submissions
     SET rekognition_attempts = COALESCE(rekognition_attempts, 0) + 1,
         updated_at = now()
   WHERE id = p_submission_id
  RETURNING rekognition_attempts INTO new_count;

  IF NOT FOUND THEN
    RETURN -1;
  END IF;
  RETURN new_count;
END;
$$;

REVOKE ALL ON FUNCTION public.increment_face_submission_attempts(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_face_submission_attempts(uuid) TO service_role;

-- ─── R2-H13 helper ───────────────────────────────────────────────────────
-- Return existing warning count + grace status for a live stream so the
-- face-check / live-frame-monitor edge functions don't have to trust client
-- state (host refresh used to reset both to 0).
CREATE OR REPLACE FUNCTION public.get_live_face_runtime(
  p_user_id uuid,
  p_stream_id uuid,
  p_grace_seconds integer DEFAULT 60
)
RETURNS TABLE (
  in_grace boolean,
  grace_ends_at timestamptz,
  warning_count integer,
  is_authorized boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  started timestamptz;
  authorized boolean := false;
BEGIN
  IF p_stream_id IS NULL THEN
    RETURN QUERY SELECT false, NULL::timestamptz, 0, false;
    RETURN;
  END IF;

  SELECT ls.started_at,
         (ls.host_id = p_user_id AND ls.is_active = true)
    INTO started, authorized
    FROM public.live_streams ls
   WHERE ls.id = p_stream_id;

  IF NOT FOUND OR NOT authorized THEN
    RETURN QUERY SELECT false, NULL::timestamptz, 0, false;
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    (now() < started + make_interval(secs => p_grace_seconds)) AS in_grace,
    (started + make_interval(secs => p_grace_seconds))         AS grace_ends_at,
    COALESCE((SELECT COUNT(*)::int
                FROM public.live_face_warnings w
               WHERE w.host_id  = p_user_id
                 AND w.stream_id = p_stream_id), 0)            AS warning_count,
    true                                                       AS is_authorized;
END;
$$;

REVOKE ALL ON FUNCTION public.get_live_face_runtime(uuid, uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_live_face_runtime(uuid, uuid, integer) TO authenticated, service_role;

-- ─── R2-H12 helper ───────────────────────────────────────────────────────
-- Cheap server-side ownership check used by face-check + live-frame-monitor
-- to confirm the caller actually hosts the streamId they're posting frames
-- for. Avoids exposing any extra `live_streams` columns to authenticated.
CREATE OR REPLACE FUNCTION public.is_live_stream_host(
  p_user_id uuid,
  p_stream_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.live_streams
     WHERE id = p_stream_id
       AND host_id = p_user_id
       AND is_active = true
  );
$$;

REVOKE ALL ON FUNCTION public.is_live_stream_host(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_live_stream_host(uuid, uuid) TO authenticated, service_role;