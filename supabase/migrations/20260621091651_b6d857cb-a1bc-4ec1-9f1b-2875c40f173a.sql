GRANT SELECT ON public.poster_images TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.poster_images TO authenticated;
GRANT ALL ON public.poster_images TO service_role;

DROP POLICY IF EXISTS "Public read posters bucket" ON storage.objects;
DROP POLICY IF EXISTS "Users upload own poster media" ON storage.objects;
DROP POLICY IF EXISTS "Users update own poster media" ON storage.objects;
DROP POLICY IF EXISTS "Users delete own poster media" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload their own posters" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own posters" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own posters" ON storage.objects;
DROP POLICY IF EXISTS "Public can view posters" ON storage.objects;

CREATE POLICY "Public read posters bucket"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'posters');

CREATE POLICY "Users upload own poster media"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'posters'
  AND auth.uid()::text = (storage.foldername(name))[1]
  AND lower(coalesce(metadata ->> 'mimetype', '')) LIKE ANY (ARRAY['image/%', 'video/%'])
);

CREATE POLICY "Users update own poster media"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'posters'
  AND auth.uid()::text = (storage.foldername(name))[1]
)
WITH CHECK (
  bucket_id = 'posters'
  AND auth.uid()::text = (storage.foldername(name))[1]
  AND lower(coalesce(metadata ->> 'mimetype', '')) LIKE ANY (ARRAY['image/%', 'video/%'])
);

CREATE POLICY "Users delete own poster media"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'posters'
  AND auth.uid()::text = (storage.foldername(name))[1]
);