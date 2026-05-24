-- Section #11 Pass-3: Live Streaming & Room Lifecycle final hardening

-- 1) Make stream_viewers -> live_streams.viewer_count exact, not incremental.
--    This prevents drift from duplicate retries, reconnect races, and trigger/RPC overlap.
CREATE OR REPLACE FUNCTION public.update_stream_stats()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stream_id uuid;
  v_count integer;
BEGIN
  v_stream_id := COALESCE(NEW.stream_id, OLD.stream_id);

  SELECT count(*)::integer
    INTO v_count
  FROM public.stream_viewers
  WHERE stream_id = v_stream_id
    AND left_at IS NULL;

  UPDATE public.live_streams
     SET viewer_count = v_count
   WHERE id = v_stream_id
     AND ended_at IS NULL;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS on_stream_viewer_change ON public.stream_viewers;
CREATE TRIGGER on_stream_viewer_change
AFTER INSERT OR UPDATE OR DELETE ON public.stream_viewers
FOR EACH ROW EXECUTE FUNCTION public.update_stream_stats();

-- 2) Harden legacy join RPC by delegating to the newer privacy-aware entry RPC.
--    Existing frontend still calls join_live_stream_viewer(uuid), so this keeps compatibility.
CREATE OR REPLACE FUNCTION public.join_live_stream_viewer(p_stream_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
  v_count integer := 0;
BEGIN
  v_result := public.enter_live_stream(p_stream_id, NULL);

  IF COALESCE((v_result->>'success')::boolean, false) IS DISTINCT FROM true THEN
    RAISE EXCEPTION '%', COALESCE(v_result->>'reason', 'Unable to enter live stream')
      USING ERRCODE = '28000';
  END IF;

  v_count := COALESCE((v_result->>'viewer_count')::integer, 0);
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.join_live_stream_viewer(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.join_live_stream_viewer(uuid) TO authenticated;

-- 3) Harden leave RPC: only the viewer can close their own row, returns exact count.
CREATE OR REPLACE FUNCTION public.leave_live_stream_viewer(p_stream_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

  UPDATE public.live_streams
     SET viewer_count = CASE WHEN ended_at IS NULL THEN v_count ELSE 0 END
   WHERE id = p_stream_id;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.leave_live_stream_viewer(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.leave_live_stream_viewer(uuid) TO authenticated;

-- 4) Make stream end cleanup DB-enforced even if caller updates live_streams directly.
CREATE OR REPLACE FUNCTION public.tg_live_streams_close_viewers_on_end()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF COALESCE(OLD.is_active, false) = true
     AND (COALESCE(NEW.is_active, false) = false OR NEW.ended_at IS NOT NULL OR NEW.status = 'ended') THEN
    UPDATE public.stream_viewers
       SET left_at = COALESCE(NEW.ended_at, now())
     WHERE stream_id = NEW.id
       AND left_at IS NULL;

    NEW.viewer_count := 0;
    NEW.is_active := false;
    NEW.ended_at := COALESCE(NEW.ended_at, now());
    NEW.status := 'ended';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_live_streams_close_viewers_on_end ON public.live_streams;
CREATE TRIGGER trg_live_streams_close_viewers_on_end
BEFORE UPDATE ON public.live_streams
FOR EACH ROW EXECUTE FUNCTION public.tg_live_streams_close_viewers_on_end();

-- 5) Harden livekit-token's DB binding dependency: hidden preload viewers must not bypass entry.
--    Admin hidden monitoring still bypasses in the edge function through x-admin-access-token.
--    No SQL object needed here; edge function code is updated separately after this migration is approved.

-- 6) Reconcile current active stream counts after the function replacement.
UPDATE public.live_streams ls
   SET viewer_count = sub.cnt
FROM (
  SELECT stream_id, count(*)::integer AS cnt
  FROM public.stream_viewers
  WHERE left_at IS NULL
  GROUP BY stream_id
) sub
WHERE ls.id = sub.stream_id
  AND ls.ended_at IS NULL;

UPDATE public.live_streams ls
   SET viewer_count = 0
WHERE ls.ended_at IS NOT NULL OR COALESCE(ls.is_active, false) = false;