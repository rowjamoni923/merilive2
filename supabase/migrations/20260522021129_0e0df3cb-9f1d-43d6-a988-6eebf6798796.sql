-- Pkg77 server data cleanup: close stale viewer rows for streams that are already inactive.
WITH stale_streams AS (
  SELECT id, COALESCE(ended_at, now()) AS closed_at
  FROM public.live_streams
  WHERE COALESCE(is_active, false) = false
)
UPDATE public.stream_viewers sv
SET left_at = COALESCE(sv.left_at, ss.closed_at)
FROM stale_streams ss
WHERE sv.stream_id = ss.id
  AND sv.left_at IS NULL;

-- Keep stored inactive stream counters consistent with the closed viewer rows.
UPDATE public.live_streams
SET viewer_count = 0,
    status = CASE WHEN COALESCE(is_active, false) = false THEN 'ended' ELSE status END
WHERE COALESCE(is_active, false) = false
  AND COALESCE(viewer_count, 0) <> 0;