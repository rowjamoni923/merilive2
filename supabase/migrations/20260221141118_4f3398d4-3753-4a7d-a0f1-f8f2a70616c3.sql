
-- Trigger: when a user_report is resolved, send notification to reporter
CREATE OR REPLACE FUNCTION public.notify_reporter_on_resolution()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only fire when status changes to 'resolved'
  IF NEW.status = 'resolved' AND (OLD.status IS DISTINCT FROM 'resolved') THEN
    INSERT INTO public.notifications (user_id, type, title, message, data, is_read)
    VALUES (
      NEW.reporter_id,
      'report_resolved',
      'Report Update',
      COALESCE(
        'Your report has been reviewed. Admin response: ' || NEW.admin_notes,
        'Your report has been reviewed and resolved. Thank you for helping keep the community safe.'
      ),
      jsonb_build_object(
        'report_id', NEW.id,
        'report_category', NEW.report_category,
        'action_taken', NEW.action_taken,
        'admin_notes', NEW.admin_notes,
        'resolved_at', NEW.reviewed_at
      ),
      false
    );
  END IF;
  RETURN NEW;
END;
$$;

-- Attach trigger
DROP TRIGGER IF EXISTS trg_notify_reporter_on_resolution ON public.user_reports;
CREATE TRIGGER trg_notify_reporter_on_resolution
  AFTER UPDATE ON public.user_reports
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_reporter_on_resolution();
