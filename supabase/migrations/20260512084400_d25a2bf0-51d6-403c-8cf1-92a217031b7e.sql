
CREATE OR REPLACE FUNCTION public.user_reports_sync_columns()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.reported_user_id IS NULL AND NEW.reported_id IS NOT NULL THEN
    NEW.reported_user_id := NEW.reported_id;
  ELSIF NEW.reported_id IS NULL AND NEW.reported_user_id IS NOT NULL THEN
    NEW.reported_id := NEW.reported_user_id;
  END IF;

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
