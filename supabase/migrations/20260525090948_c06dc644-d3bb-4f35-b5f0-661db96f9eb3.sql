-- Admin write policies for `games` bucket (bucket already public:true for reads)
DROP POLICY IF EXISTS games_admin_insert ON storage.objects;
DROP POLICY IF EXISTS games_admin_update ON storage.objects;
DROP POLICY IF EXISTS games_admin_delete ON storage.objects;

CREATE POLICY games_admin_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'games' AND public.is_active_admin_session());

CREATE POLICY games_admin_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'games' AND public.is_active_admin_session())
  WITH CHECK (bucket_id = 'games' AND public.is_active_admin_session());

CREATE POLICY games_admin_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'games' AND public.is_active_admin_session());

-- Ensure bucket stays public so anyone can view the photos
UPDATE storage.buckets SET public = true WHERE id = 'games';