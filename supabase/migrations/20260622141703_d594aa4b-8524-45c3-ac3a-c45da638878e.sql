
CREATE POLICY "saa own upload" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'super-admin-agreements' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "saa own read" ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'super-admin-agreements'
  AND ((storage.foldername(name))[1] = auth.uid()::text OR public.has_role(auth.uid(), 'admin'))
);

CREATE POLICY "saa own update" ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'super-admin-agreements' AND (storage.foldername(name))[1] = auth.uid()::text);
