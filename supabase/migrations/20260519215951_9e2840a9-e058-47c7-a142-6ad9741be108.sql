-- Replace any historical partial unique index with a real unique constraint for reliable ON CONFLICT.
DROP INDEX IF EXISTS public.stream_viewers_stream_viewer_uidx;

ALTER TABLE public.stream_viewers
  ALTER COLUMN stream_id SET NOT NULL,
  ALTER COLUMN viewer_id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.stream_viewers'::regclass
      AND conname = 'stream_viewers_stream_viewer_key'
  ) THEN
    ALTER TABLE public.stream_viewers
      ADD CONSTRAINT stream_viewers_stream_viewer_key UNIQUE (stream_id, viewer_id);
  END IF;
END $$;