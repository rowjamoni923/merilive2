-- R2-H10 retention marker
ALTER TABLE public.face_verification_submissions
  ADD COLUMN IF NOT EXISTS images_purged_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_face_subs_purge_candidates
  ON public.face_verification_submissions (status, updated_at)
  WHERE images_purged_at IS NULL;

-- R2-H11: tighten the reels INSERT policy. The current policy only checks
-- that the first folder = auth.uid(). We additionally enforce:
--   • declared mimetype starts with `video/`
--   • lowercase extension is one of the standard video containers
-- This blocks mime spoof (uploading .exe declared as video) and unknown
-- container abuse without breaking the existing per-user folder rule.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'storage'
       AND tablename = 'objects'
       AND policyname = 'Authenticated users can upload reels'
  ) THEN
    DROP POLICY "Authenticated users can upload reels" ON storage.objects;
  END IF;
END
$$;

CREATE POLICY "Authenticated users can upload reels"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'reels'
    AND auth.uid() IS NOT NULL
    AND (auth.uid())::text = (storage.foldername(name))[1]
    AND lower(COALESCE(metadata->>'mimetype', '')) LIKE 'video/%'
    AND lower(COALESCE(split_part(name, '.', array_length(string_to_array(name, '.'), 1)), ''))
        = ANY (ARRAY['mp4','mov','webm','m4v'])
  );