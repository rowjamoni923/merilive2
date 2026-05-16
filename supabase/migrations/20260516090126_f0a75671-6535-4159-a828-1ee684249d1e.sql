-- Owner can read own face/host verification files
CREATE POLICY "owner_read_face-verification"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'face-verification'
  AND (storage.foldername(name))[1] = (auth.uid())::text
);

CREATE POLICY "owner_read_host-verification"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'host-verification'
  AND (storage.foldername(name))[1] = (auth.uid())::text
);

-- Admin session can read host-verification (parity with face-verification)
CREATE POLICY "admin_session_read_host_verification"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'host-verification'
  AND is_active_admin_session()
);