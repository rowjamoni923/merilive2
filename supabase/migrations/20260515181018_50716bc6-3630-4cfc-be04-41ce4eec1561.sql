INSERT INTO storage.buckets (id, name, public)
VALUES ('support-attachments', 'support-attachments', false)
ON CONFLICT (id) DO UPDATE SET public = false;

DROP POLICY IF EXISTS "support_attachments_user_insert_own" ON storage.objects;
CREATE POLICY "support_attachments_user_insert_own"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'support-attachments'
  AND auth.uid() IS NOT NULL
  AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "support_attachments_user_select_own" ON storage.objects;
CREATE POLICY "support_attachments_user_select_own"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'support-attachments'
  AND auth.uid() IS NOT NULL
  AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "support_attachments_user_update_own" ON storage.objects;
CREATE POLICY "support_attachments_user_update_own"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'support-attachments'
  AND auth.uid() IS NOT NULL
  AND (storage.foldername(name))[1] = auth.uid()::text
)
WITH CHECK (
  bucket_id = 'support-attachments'
  AND auth.uid() IS NOT NULL
  AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "support_attachments_admin_session_full_access" ON storage.objects;
CREATE POLICY "support_attachments_admin_session_full_access"
ON storage.objects
FOR ALL
TO anon, authenticated
USING (
  bucket_id = 'support-attachments'
  AND public.is_active_admin_session()
)
WITH CHECK (
  bucket_id = 'support-attachments'
  AND public.is_active_admin_session()
);