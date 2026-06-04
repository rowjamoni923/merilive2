CREATE OR REPLACE FUNCTION public.cleanup_stale_live_streams()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  closed_count integer;
BEGIN
  -- Pkg426: Professional live-streaming pattern.
  -- Web hosts no longer auto-end on `pagehide`/`beforeunload` (those events
  -- fire on tab-switch / notification shade / permission dialog in iOS Safari
  -- and Android WebView and were causing 2–15s random cuts).
  -- Stale window tightened 10m -> 3m so an abandoned browser tab still
  -- cleans up quickly. Host heartbeat fires every 15s, so 3m = 12x safety.
  UPDATE public.stream_viewers sv
  SET left_at = now()
  FROM public.live_streams ls
  WHERE sv.stream_id = ls.id
    AND sv.left_at IS NULL
    AND COALESCE(ls.is_active, false) = true
    AND COALESCE(ls.last_heartbeat, ls.started_at, ls.created_at) < now() - interval '3 minutes';

  UPDATE public.live_streams
  SET is_active = false,
      ended_at = COALESCE(ended_at, now()),
      status = 'ended',
      viewer_count = 0
  WHERE COALESCE(is_active, false) = true
    AND COALESCE(last_heartbeat, started_at, created_at) < now() - interval '3 minutes';

  GET DIAGNOSTICS closed_count = ROW_COUNT;
  RETURN closed_count;
END;
$function$;