-- Pkg427: tighten stale-viewer sweep window from 90s → 45s so that abandoned
-- tabs, killed apps, and network drops drop off the counter within ~1 minute
-- (matches Bigo/Chamet accuracy). Client heartbeat cadence dropped to 15s so
-- every active viewer pings twice inside the new stale window.
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
       AND last_seen_at < now() - interval '45 seconds'
    RETURNING stream_id
  ), touched AS (
    SELECT DISTINCT stream_id FROM stale
  )
  SELECT count(*) INTO v_closed FROM stale;

  PERFORM set_config('app.bypass_live_stream_guard', 'on', true);
  WITH touched AS (
    SELECT DISTINCT sv.stream_id
      FROM public.stream_viewers sv
     WHERE sv.left_at >= now() - interval '45 seconds'
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

-- Bump cron cadence to every 30 seconds so stale viewers vanish within ~1 min
-- of leaving. pg_cron minimum is 1 minute for scheduled jobs, so we schedule
-- two staggered jobs to achieve 30s effective cadence.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cleanup_stale_stream_viewers_every_minute_offset') THEN
    PERFORM cron.unschedule('cleanup_stale_stream_viewers_every_minute_offset');
  END IF;
  PERFORM cron.schedule(
    'cleanup_stale_stream_viewers_every_minute_offset',
    '* * * * *',
    'SELECT pg_sleep(30); SELECT public.cleanup_stale_stream_viewers();'
  );
END $$;