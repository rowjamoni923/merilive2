
-- Pkg423: Live stream viewer count accuracy via heartbeat sweep

ALTER TABLE public.stream_viewers
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_stream_viewers_active_last_seen
  ON public.stream_viewers (stream_id, last_seen_at)
  WHERE left_at IS NULL;

-- Self-only heartbeat RPC. Updates caller's active viewer row last_seen_at and
-- returns the current live viewer count for the stream. No-op if not joined.
CREATE OR REPLACE FUNCTION public.viewer_heartbeat(p_stream_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_count integer := 0;
BEGIN
  IF v_uid IS NULL OR p_stream_id IS NULL THEN
    RETURN 0;
  END IF;

  UPDATE public.stream_viewers
     SET last_seen_at = now()
   WHERE stream_id = p_stream_id
     AND viewer_id = v_uid
     AND left_at IS NULL;

  SELECT count(*)::integer INTO v_count
    FROM public.stream_viewers
   WHERE stream_id = p_stream_id
     AND left_at IS NULL;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.viewer_heartbeat(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.viewer_heartbeat(uuid) TO authenticated, service_role;

-- Per-minute sweep: close viewers with no heartbeat in 90s and recompute
-- live_streams.viewer_count from the truthful active set.
CREATE OR REPLACE FUNCTION public.cleanup_stale_stream_viewers()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_closed integer := 0;
  v_streams_touched integer := 0;
BEGIN
  WITH stale AS (
    UPDATE public.stream_viewers
       SET left_at = now()
     WHERE left_at IS NULL
       AND last_seen_at < now() - interval '90 seconds'
    RETURNING stream_id
  ), touched AS (
    SELECT DISTINCT stream_id FROM stale
  )
  SELECT count(*) INTO v_closed FROM stale;

  PERFORM set_config('app.bypass_live_stream_guard', 'on', true);
  WITH touched AS (
    SELECT DISTINCT sv.stream_id
      FROM public.stream_viewers sv
     WHERE sv.left_at >= now() - interval '90 seconds'
  ), counts AS (
    SELECT ls.id, COALESCE((
      SELECT count(*) FROM public.stream_viewers v
       WHERE v.stream_id = ls.id AND v.left_at IS NULL
    ), 0)::integer AS active
      FROM public.live_streams ls
     WHERE ls.id IN (SELECT stream_id FROM touched)
  )
  UPDATE public.live_streams ls
     SET viewer_count = c.active
    FROM counts c
   WHERE ls.id = c.id
     AND ls.ended_at IS NULL;
  GET DIAGNOSTICS v_streams_touched = ROW_COUNT;
  PERFORM set_config('app.bypass_live_stream_guard', 'off', true);

  RETURN jsonb_build_object(
    'success', true,
    'viewers_closed', v_closed,
    'streams_recounted', v_streams_touched,
    'ran_at', now()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_stale_stream_viewers() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_stale_stream_viewers() TO service_role;

-- Schedule cron: every minute
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cleanup_stale_stream_viewers_every_minute') THEN
    PERFORM cron.unschedule('cleanup_stale_stream_viewers_every_minute');
  END IF;
  PERFORM cron.schedule(
    'cleanup_stale_stream_viewers_every_minute',
    '* * * * *',
    'SELECT public.cleanup_stale_stream_viewers();'
  );

  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cleanup_stale_live_streams_every_minute') THEN
    PERFORM cron.schedule(
      'cleanup_stale_live_streams_every_minute',
      '* * * * *',
      'SELECT public.cleanup_stale_live_streams();'
    );
  END IF;
END $$;
