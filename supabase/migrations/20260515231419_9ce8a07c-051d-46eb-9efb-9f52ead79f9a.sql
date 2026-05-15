-- RLS policies for rating-screenshots bucket (bucket stays private; admin uses signed URLs)

DROP POLICY IF EXISTS "Users upload own rating screenshots" ON storage.objects;
DROP POLICY IF EXISTS "Users read own rating screenshots" ON storage.objects;
DROP POLICY IF EXISTS "Users update own rating screenshots" ON storage.objects;
DROP POLICY IF EXISTS "Admins manage all rating screenshots" ON storage.objects;
DROP POLICY IF EXISTS "Admin session manage rating screenshots" ON storage.objects;

CREATE POLICY "Users upload own rating screenshots"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'rating-screenshots'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users read own rating screenshots"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'rating-screenshots'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users update own rating screenshots"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'rating-screenshots'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Admins manage all rating screenshots"
ON storage.objects FOR ALL
USING (
  bucket_id = 'rating-screenshots'
  AND (
    is_admin(auth.uid())
    OR is_active_admin_session()
    OR EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid() AND is_active = true)
  )
)
WITH CHECK (
  bucket_id = 'rating-screenshots'
  AND (
    is_admin(auth.uid())
    OR is_active_admin_session()
    OR EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid() AND is_active = true)
  )
);