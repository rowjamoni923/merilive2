-- Fix live stream viewer presence uniqueness and add reliable join/leave RPCs

-- Ensure every existing viewer row has an id before adding constraints.
UPDATE public.stream_viewers
SET id = gen_random_uuid()
WHERE id IS NULL;

-- Remove duplicate rows so one viewer has exactly one presence row per stream.
WITH ranked AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY stream_id, viewer_id
      ORDER BY
        (left_at IS NULL) DESC,
        joined_at DESC NULLS LAST,
        id DESC
    ) AS rn
  FROM public.stream_viewers
)
DELETE FROM public.stream_viewers sv
USING ranked r
WHERE sv.id = r.id
  AND r.rn > 1;

-- Add missing primary key if this historical table does not have one.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.stream_viewers'::regclass
      AND contype = 'p'
  ) THEN
    ALTER TABLE public.stream_viewers
      ADD CONSTRAINT stream_viewers_pkey PRIMARY KEY (id);
  END IF;
END $$;

-- Required for client/server UPSERT on (stream_id, viewer_id).
CREATE UNIQUE INDEX IF NOT EXISTS stream_viewers_stream_viewer_uidx
ON public.stream_viewers (stream_id, viewer_id);

-- Keep count trigger exact and resilient for insert/rejoin/leave/delete.
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
    RETURN NEW;
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
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.left_at IS NULL THEN
      UPDATE public.live_streams
      SET viewer_count = GREATEST(COALESCE(viewer_count, 0) - 1, 0)
      WHERE id = OLD.stream_id;
    END IF;
    RETURN OLD;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$function$;

DROP TRIGGER IF EXISTS on_stream_viewer_change ON public.stream_viewers;
CREATE TRIGGER on_stream_viewer_change
AFTER INSERT OR UPDATE OR DELETE ON public.stream_viewers
FOR EACH ROW EXECUTE FUNCTION public.update_stream_stats();

-- Server-side join: validates active stream, upserts presence, returns exact active count.
CREATE OR REPLACE FUNCTION public.join_live_stream_viewer(p_stream_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _viewer_id uuid := auth.uid();
  _count integer := 0;
BEGIN
  IF _viewer_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.live_streams ls
    WHERE ls.id = p_stream_id
      AND COALESCE(ls.is_active, true) = true
      AND ls.ended_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Live stream is not active';
  END IF;

  INSERT INTO public.stream_viewers (stream_id, viewer_id, joined_at, left_at)
  VALUES (p_stream_id, _viewer_id, now(), NULL)
  ON CONFLICT (stream_id, viewer_id)
  DO UPDATE SET
    joined_at = CASE
      WHEN public.stream_viewers.left_at IS NULL THEN public.stream_viewers.joined_at
      ELSE now()
    END,
    left_at = NULL;

  SELECT count(*)::integer
  INTO _count
  FROM public.stream_viewers
  WHERE stream_id = p_stream_id
    AND left_at IS NULL;

  UPDATE public.live_streams
  SET viewer_count = _count
  WHERE id = p_stream_id;

  RETURN _count;
END;
$function$;

-- Server-side leave: closes own presence and returns exact active count.
CREATE OR REPLACE FUNCTION public.leave_live_stream_viewer(p_stream_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _viewer_id uuid := auth.uid();
  _count integer := 0;
BEGIN
  IF _viewer_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  UPDATE public.stream_viewers
  SET left_at = now()
  WHERE stream_id = p_stream_id
    AND viewer_id = _viewer_id
    AND left_at IS NULL;

  SELECT count(*)::integer
  INTO _count
  FROM public.stream_viewers
  WHERE stream_id = p_stream_id
    AND left_at IS NULL;

  UPDATE public.live_streams
  SET viewer_count = _count
  WHERE id = p_stream_id;

  RETURN _count;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.join_live_stream_viewer(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.leave_live_stream_viewer(uuid) TO authenticated;

-- Reconcile any existing drift after constraint cleanup.
UPDATE public.live_streams ls
SET viewer_count = sub.cnt
FROM (
  SELECT stream_id, count(*)::integer AS cnt
  FROM public.stream_viewers
  WHERE left_at IS NULL
  GROUP BY stream_id
) sub
WHERE ls.id = sub.stream_id
  AND COALESCE(ls.viewer_count, -1) <> sub.cnt;

UPDATE public.live_streams
SET viewer_count = 0
WHERE COALESCE(viewer_count, 0) <> 0
  AND id NOT IN (
    SELECT DISTINCT stream_id
    FROM public.stream_viewers
    WHERE left_at IS NULL
  );