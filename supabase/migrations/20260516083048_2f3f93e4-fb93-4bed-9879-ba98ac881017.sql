CREATE POLICY "admin_session_read_face_verification"
ON storage.objects FOR SELECT
USING (bucket_id = 'face-verification' AND public.is_active_admin_session());