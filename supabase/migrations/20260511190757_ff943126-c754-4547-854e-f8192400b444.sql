
-- Fix stream_viewers trigger: handle rejoin (left_at NOT NULL -> NULL) and DELETE
CREATE OR REPLACE FUNCTION public.update_stream_stats()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.left_at IS NULL THEN
      UPDATE public.live_streams
      SET viewer_count = COALESCE(viewer_count, 0) + 1
      WHERE id = NEW.stream_id;
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.left_at IS NOT NULL AND OLD.left_at IS NULL THEN
      UPDATE public.live_streams
      SET viewer_count = GREATEST(COALESCE(viewer_count, 0) - 1, 0)
      WHERE id = NEW.stream_id;
    ELSIF NEW.left_at IS NULL AND OLD.left_at IS NOT NULL THEN
      UPDATE public.live_streams
      SET viewer_count = COALESCE(viewer_count, 0) + 1
      WHERE id = NEW.stream_id;
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.left_at IS NULL THEN
      UPDATE public.live_streams
      SET viewer_count = GREATEST(COALESCE(viewer_count, 0) - 1, 0)
      WHERE id = OLD.stream_id;
    END IF;
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS on_stream_viewer_change ON public.stream_viewers;
CREATE TRIGGER on_stream_viewer_change
AFTER INSERT OR UPDATE OR DELETE ON public.stream_viewers
FOR EACH ROW EXECUTE FUNCTION public.update_stream_stats();

-- Party room trigger references a column that doesn't exist on party_rooms.
-- Make it a safe no-op so joins/leaves never fail; UI derives count live from party_room_participants.
CREATE OR REPLACE FUNCTION public.update_room_participant_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN COALESCE(NEW, OLD);
END;
$function$;

-- Reconcile drift in live_streams.viewer_count
UPDATE public.live_streams ls
SET viewer_count = sub.cnt
FROM (
  SELECT stream_id, COUNT(*)::int AS cnt
  FROM public.stream_viewers
  WHERE left_at IS NULL
  GROUP BY stream_id
) sub
WHERE ls.id = sub.stream_id AND COALESCE(ls.viewer_count, -1) <> sub.cnt;

UPDATE public.live_streams
SET viewer_count = 0
WHERE COALESCE(viewer_count, 0) <> 0
  AND id NOT IN (SELECT DISTINCT stream_id FROM public.stream_viewers WHERE left_at IS NULL);
