
CREATE OR REPLACE FUNCTION public.alert_stuck_face_verifications(_threshold_minutes int DEFAULT 10)
RETURNS TABLE(submission_id uuid, user_id uuid, stuck_minutes int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  v_profile record;
  v_last_status text;
  v_minutes int;
  v_already boolean;
BEGIN
  FOR r IN
    SELECT s.id, s.user_id, s.status, s.ai_analysis, s.admin_notes,
           COALESCE(s.updated_at, s.created_at) AS since_ts
    FROM public.face_verification_submissions s
    WHERE s.status IN ('under_review','pending','submitted','processing')
      AND COALESCE(s.updated_at, s.created_at) < now() - make_interval(mins => _threshold_minutes)
  LOOP
    v_minutes := EXTRACT(EPOCH FROM (now() - r.since_ts))::int / 60;

    -- Dedup: skip if an unresolved alert already exists for this submission
    SELECT EXISTS(
      SELECT 1 FROM public.security_alerts
      WHERE alert_type = 'face_verification_stuck'
        AND is_resolved = false
        AND metadata->>'submission_id' = r.id::text
    ) INTO v_already;
    IF v_already THEN CONTINUE; END IF;

    v_last_status := COALESCE(
      r.ai_analysis->>'analyzer_status',
      r.ai_analysis->>'decision',
      r.ai_analysis->>'status',
      r.status
    );

    SELECT username, uid INTO v_profile FROM public.profiles WHERE id = r.user_id;

    INSERT INTO public.security_alerts(alert_type, severity, user_id, description, metadata)
    VALUES (
      'face_verification_stuck',
      CASE WHEN v_minutes >= 30 THEN 'high' ELSE 'medium' END,
      r.user_id,
      format('Face verification stuck in %s for %s min (user %s)',
             r.status, v_minutes, COALESCE(v_profile.username, r.user_id::text)),
      jsonb_build_object(
        'submission_id', r.id,
        'user_id', r.user_id,
        'username', v_profile.username,
        'uid', v_profile.uid,
        'submission_status', r.status,
        'analyzer_status', v_last_status,
        'stuck_minutes', v_minutes,
        'since', r.since_ts,
        'admin_notes', r.admin_notes
      )
    );

    INSERT INTO public.admin_notifications(type, title, message, priority, target_role, data)
    VALUES (
      'face_verification_stuck',
      '⚠️ Face Verification Stuck',
      format('Submission for %s has been in "%s" for %s minutes. Analyzer status: %s',
             COALESCE(v_profile.username, r.user_id::text), r.status, v_minutes, v_last_status),
      CASE WHEN v_minutes >= 30 THEN 'high' ELSE 'medium' END,
      'admin',
      jsonb_build_object(
        'submission_id', r.id,
        'user_id', r.user_id,
        'username', v_profile.username,
        'uid', v_profile.uid,
        'submission_status', r.status,
        'analyzer_status', v_last_status,
        'stuck_minutes', v_minutes,
        'since', r.since_ts
      )
    );

    submission_id := r.id;
    user_id := r.user_id;
    stuck_minutes := v_minutes;
    RETURN NEXT;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.alert_stuck_face_verifications(int) TO service_role;

-- Schedule via pg_cron every 5 minutes
DO $$
BEGIN
  PERFORM cron.unschedule('alert-stuck-face-verifications');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'alert-stuck-face-verifications',
  '*/5 * * * *',
  $$SELECT public.alert_stuck_face_verifications(10);$$
);
