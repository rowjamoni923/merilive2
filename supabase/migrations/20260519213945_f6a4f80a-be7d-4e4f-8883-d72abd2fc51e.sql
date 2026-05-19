
-- 1. Baseline table
CREATE TABLE public.storage_bucket_visibility_baseline (
  bucket_id text PRIMARY KEY,
  expected_public boolean NOT NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.storage_bucket_visibility_baseline ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage bucket baseline"
  ON public.storage_bucket_visibility_baseline FOR ALL
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admin session manages bucket baseline"
  ON public.storage_bucket_visibility_baseline FOR ALL
  USING (public.is_active_admin_session())
  WITH CHECK (public.is_active_admin_session());

-- Seed baseline from current state
INSERT INTO public.storage_bucket_visibility_baseline (bucket_id, expected_public)
SELECT id, public FROM storage.buckets
ON CONFLICT (bucket_id) DO NOTHING;

-- 2. Alerts log
CREATE TABLE public.bucket_visibility_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_id text NOT NULL,
  expected_public boolean NOT NULL,
  actual_public boolean NOT NULL,
  detected_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  notified boolean NOT NULL DEFAULT false
);

CREATE INDEX idx_bucket_alerts_unresolved
  ON public.bucket_visibility_alerts (bucket_id) WHERE resolved_at IS NULL;

ALTER TABLE public.bucket_visibility_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read bucket alerts"
  ON public.bucket_visibility_alerts FOR SELECT
  USING (public.is_admin(auth.uid()) OR public.is_active_admin_session());

CREATE POLICY "Admin session manages bucket alerts"
  ON public.bucket_visibility_alerts FOR ALL
  USING (public.is_active_admin_session())
  WITH CHECK (public.is_active_admin_session());

-- 3. Drift detection function
CREATE OR REPLACE FUNCTION public.check_bucket_visibility_drift()
RETURNS TABLE(drift_count int, resolved_count int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_drift int := 0;
  v_resolved int := 0;
  r RECORD;
  v_admin_id uuid;
BEGIN
  -- Detect drift: bucket whose actual public != baseline expected
  FOR r IN
    SELECT b.id AS bucket_id, b.public AS actual_public, bl.expected_public
    FROM storage.buckets b
    JOIN public.storage_bucket_visibility_baseline bl ON bl.bucket_id = b.id
    WHERE b.public IS DISTINCT FROM bl.expected_public
  LOOP
    -- Only insert new alert if no unresolved alert exists for this bucket
    IF NOT EXISTS (
      SELECT 1 FROM public.bucket_visibility_alerts
      WHERE bucket_id = r.bucket_id AND resolved_at IS NULL
    ) THEN
      INSERT INTO public.bucket_visibility_alerts (bucket_id, expected_public, actual_public)
      VALUES (r.bucket_id, r.expected_public, r.actual_public);

      -- Notify all admins via notifications table (triggers FCM push)
      FOR v_admin_id IN
        SELECT user_id FROM public.user_roles WHERE role = 'admin'
      LOOP
        INSERT INTO public.notifications (user_id, type, title, body, data)
        VALUES (
          v_admin_id,
          'system_alert',
          '⚠️ Storage bucket visibility changed',
          format('Bucket "%s" is now %s but baseline expects %s. Restore immediately.',
            r.bucket_id,
            CASE WHEN r.actual_public THEN 'PUBLIC' ELSE 'PRIVATE' END,
            CASE WHEN r.expected_public THEN 'PUBLIC' ELSE 'PRIVATE' END),
          jsonb_build_object('bucket_id', r.bucket_id, 'expected', r.expected_public, 'actual', r.actual_public)
        );
      END LOOP;

      v_drift := v_drift + 1;
    END IF;
  END LOOP;

  -- Auto-resolve alerts where bucket is back to expected state
  UPDATE public.bucket_visibility_alerts a
  SET resolved_at = now()
  WHERE a.resolved_at IS NULL
    AND EXISTS (
      SELECT 1 FROM storage.buckets b
      JOIN public.storage_bucket_visibility_baseline bl ON bl.bucket_id = b.id
      WHERE b.id = a.bucket_id AND b.public = bl.expected_public
    );
  GET DIAGNOSTICS v_resolved = ROW_COUNT;

  RETURN QUERY SELECT v_drift, v_resolved;
END;
$$;

REVOKE ALL ON FUNCTION public.check_bucket_visibility_drift() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_bucket_visibility_drift() TO postgres, service_role;

-- 4. Schedule every 5 minutes
SELECT cron.schedule(
  'bucket-visibility-monitor',
  '*/5 * * * *',
  $$ SELECT public.check_bucket_visibility_drift(); $$
);

-- Run once immediately to validate
SELECT public.check_bucket_visibility_drift();
