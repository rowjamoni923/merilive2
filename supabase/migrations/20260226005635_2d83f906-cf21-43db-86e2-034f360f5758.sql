
-- Function to archive and reset weekly contact sharing violations
CREATE OR REPLACE FUNCTION public.reset_weekly_contact_violations()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  week_start timestamptz;
  week_end timestamptz;
BEGIN
  -- Calculate the week that just ended
  week_end := now();
  week_start := week_end - interval '7 days';

  -- Mark all unreviewed violations as archived (weekly reset)
  UPDATE public.chat_moderation_logs
  SET 
    action_taken = COALESCE(action_taken, '') || '_weekly_archived',
    reviewed_at = now(),
    notes = COALESCE(notes, '') || ' [Auto-archived: Weekly reset at ' || now()::text || ']'
  WHERE violation_type IN ('contact_sharing', 'phone_number', 'social_media', 'image_contact')
    AND reviewed_at IS NULL
    AND created_at >= week_start
    AND created_at < week_end;

  -- Also archive host_contact_violations
  UPDATE public.host_contact_violations
  SET 
    admin_reviewed = true,
    admin_action = COALESCE(admin_action, 'weekly_archived'),
    admin_notes = COALESCE(admin_notes, '') || ' [Weekly reset: ' || now()::text || ']'
  WHERE admin_reviewed = false
    AND detected_at < week_end;

  RAISE NOTICE 'Weekly contact violations reset completed at %', now();
END;
$$;
