
-- Align user_reports schema with dialog + admin page expectations,
-- and grant authenticated users the ability to file a report.

-- 1. Add new columns expected by ReportUserDialog and AdminUserReports
ALTER TABLE public.user_reports
  ADD COLUMN IF NOT EXISTS reported_user_id uuid,
  ADD COLUMN IF NOT EXISTS report_category text,
  ADD COLUMN IF NOT EXISTS context_type text DEFAULT 'general',
  ADD COLUMN IF NOT EXISTS context_id uuid,
  ADD COLUMN IF NOT EXISTS action_taken text;

-- 2. Backfill new columns from legacy ones (no data loss)
UPDATE public.user_reports
   SET reported_user_id = COALESCE(reported_user_id, reported_id),
       report_category  = COALESCE(report_category, reason)
 WHERE reported_user_id IS NULL OR report_category IS NULL;

-- 3. Trigger to keep legacy + new columns mirrored both ways
--    (so any old code or RPC keeps working, and inserts via either name succeed)
CREATE OR REPLACE FUNCTION public.user_reports_sync_columns()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- reported_id <-> reported_user_id
  IF NEW.reported_user_id IS NULL AND NEW.reported_id IS NOT NULL THEN
    NEW.reported_user_id := NEW.reported_id;
  ELSIF NEW.reported_id IS NULL AND NEW.reported_user_id IS NOT NULL THEN
    NEW.reported_id := NEW.reported_user_id;
  END IF;

  -- reason <-> report_category
  IF NEW.report_category IS NULL AND NEW.reason IS NOT NULL THEN
    NEW.report_category := NEW.reason;
  ELSIF NEW.reason IS NULL AND NEW.report_category IS NOT NULL THEN
    NEW.reason := NEW.report_category;
  END IF;

  IF NEW.status IS NULL THEN
    NEW.status := 'pending';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_user_reports_sync ON public.user_reports;
CREATE TRIGGER trg_user_reports_sync
  BEFORE INSERT OR UPDATE ON public.user_reports
  FOR EACH ROW EXECUTE FUNCTION public.user_reports_sync_columns();

-- 4. Now make new columns mandatory (after backfill + trigger)
ALTER TABLE public.user_reports
  ALTER COLUMN reported_user_id SET NOT NULL,
  ALTER COLUMN report_category  SET NOT NULL;

-- 5. Helpful indexes for admin filtering
CREATE INDEX IF NOT EXISTS idx_user_reports_status ON public.user_reports(status);
CREATE INDEX IF NOT EXISTS idx_user_reports_reported_user ON public.user_reports(reported_user_id);
CREATE INDEX IF NOT EXISTS idx_user_reports_reporter ON public.user_reports(reporter_id);
CREATE INDEX IF NOT EXISTS idx_user_reports_created ON public.user_reports(created_at DESC);

-- 6. RLS — allow authenticated users to file reports (their own only),
--    and to see reports they themselves filed. Admin policies stay intact.
DROP POLICY IF EXISTS "Users can file own reports" ON public.user_reports;
CREATE POLICY "Users can file own reports"
  ON public.user_reports
  FOR INSERT TO authenticated
  WITH CHECK (
    reporter_id = auth.uid()
    AND reported_user_id IS NOT NULL
    AND reported_user_id <> auth.uid()
  );

DROP POLICY IF EXISTS "Users can view own filed reports" ON public.user_reports;
CREATE POLICY "Users can view own filed reports"
  ON public.user_reports
  FOR SELECT TO authenticated
  USING (reporter_id = auth.uid());
