-- Live/party/call reliability hardening: avoid premature active stream cleanup
CREATE OR REPLACE FUNCTION public.cleanup_stale_live_streams()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  closed_count integer;
BEGIN
  -- Android native LiveKit keeps media alive through foreground service, but
  -- WebView/JS heartbeats can be delayed by OS lifecycle, permission sheets,
  -- PiP and network handoffs. Use a conservative stale window so cleanup never
  -- closes a real host session after only a short heartbeat gap.
  UPDATE public.stream_viewers sv
  SET left_at = now()
  FROM public.live_streams ls
  WHERE sv.stream_id = ls.id
    AND sv.left_at IS NULL
    AND COALESCE(ls.is_active, false) = true
    AND COALESCE(ls.last_heartbeat, ls.started_at, ls.created_at) < now() - interval '10 minutes';

  UPDATE public.live_streams
  SET is_active = false,
      ended_at = COALESCE(ended_at, now()),
      status = 'ended',
      viewer_count = 0
  WHERE COALESCE(is_active, false) = true
    AND COALESCE(last_heartbeat, started_at, created_at) < now() - interval '10 minutes';

  GET DIAGNOSTICS closed_count = ROW_COUNT;
  RETURN closed_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_stream_heartbeat(_stream_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.live_streams
  SET last_heartbeat = now(),
      status = CASE WHEN COALESCE(is_active, false) = true AND ended_at IS NULL THEN 'live' ELSE status END
  WHERE id = _stream_id
    AND is_active = true
    AND ended_at IS NULL
    AND host_id = auth.uid();
END;
$$;