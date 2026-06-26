CREATE TABLE IF NOT EXISTS public.push_broadcast_dispatches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'completed', 'failed')),
  request jsonb NOT NULL DEFAULT '{}'::jsonb,
  result jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_push_broadcast_dispatches_created_at
  ON public.push_broadcast_dispatches (created_at DESC);

GRANT SELECT ON public.push_broadcast_dispatches TO anon, authenticated;
GRANT ALL ON public.push_broadcast_dispatches TO service_role;

ALTER TABLE public.push_broadcast_dispatches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS push_broadcast_dispatches_admin_select ON public.push_broadcast_dispatches;
CREATE POLICY push_broadcast_dispatches_admin_select
  ON public.push_broadcast_dispatches
  FOR SELECT TO anon, authenticated
  USING (public.is_active_admin_session());

DROP POLICY IF EXISTS push_broadcast_dispatches_service_all ON public.push_broadcast_dispatches;
CREATE POLICY push_broadcast_dispatches_service_all
  ON public.push_broadcast_dispatches
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

DROP TRIGGER IF EXISTS update_push_broadcast_dispatches_updated_at ON public.push_broadcast_dispatches;
CREATE TRIGGER update_push_broadcast_dispatches_updated_at
  BEFORE UPDATE ON public.push_broadcast_dispatches
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

DROP POLICY IF EXISTS "admin_broadcast_images_select" ON storage.objects;
CREATE POLICY "admin_broadcast_images_select" ON storage.objects
FOR SELECT TO anon, authenticated
USING (
  bucket_id = 'assets'
  AND (storage.foldername(name))[1] = 'broadcast'
  AND public.is_active_admin_session()
);

DROP POLICY IF EXISTS broadcast_notification_templates_admin_select ON public.notification_templates;
CREATE POLICY broadcast_notification_templates_admin_select
  ON public.notification_templates
  FOR SELECT TO anon, authenticated
  USING (public.is_active_admin_session());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.notification_templates TO anon, authenticated;
GRANT ALL ON public.notification_templates TO service_role;