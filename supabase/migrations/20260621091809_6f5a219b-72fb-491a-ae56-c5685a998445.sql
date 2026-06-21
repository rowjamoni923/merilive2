DROP POLICY IF EXISTS "Users upload own poster media" ON storage.objects;
DROP POLICY IF EXISTS "Users update own poster media" ON storage.objects;

CREATE POLICY "Users upload own poster media"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'posters'
  AND auth.uid()::text = (storage.foldername(name))[1]
  AND (
    lower(coalesce(metadata ->> 'mimetype', '')) LIKE ANY (ARRAY['image/%', 'video/%'])
    OR lower(coalesce(split_part(name, '.', array_length(string_to_array(name, '.'), 1)), '')) = ANY (
      ARRAY['jpg','jpeg','png','webp','gif','avif','bmp','svg','apng','mp4','webm','mov','m4v','ogg']
    )
  )
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
  AND (
    lower(coalesce(metadata ->> 'mimetype', '')) LIKE ANY (ARRAY['image/%', 'video/%'])
    OR lower(coalesce(split_part(name, '.', array_length(string_to_array(name, '.'), 1)), '')) = ANY (
      ARRAY['jpg','jpeg','png','webp','gif','avif','bmp','svg','apng','mp4','webm','mov','m4v','ogg']
    )
  )
);