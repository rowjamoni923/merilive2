
WITH stuck AS (
  SELECT id, user_id
  FROM public.face_verification_submissions
  WHERE status IN ('submitted','pending','under_review')
    AND updated_at < now() - interval '90 seconds'
)
UPDATE public.face_verification_submissions s
SET status = 'needs_retry',
    rejection_reason = NULL,
    reviewed_at = NULL,
    admin_notes = COALESCE(s.admin_notes,'') || E'\n[needs_retry] auto-healed: stuck in review > 90s — likely oversized image or analyzer crash.',
    updated_at = now()
FROM stuck
WHERE s.id = stuck.id;

INSERT INTO public.notifications (user_id, type, title, message, data)
SELECT s.user_id,
       'face_verification_retry',
       'Face Verification — Please Retry',
       'We could not finish reviewing your face verification. Please retake your photo, live face scan and intro video in good light and submit again.',
       jsonb_build_object('route','/face-verification','reason','auto_healed_stuck')
FROM public.face_verification_submissions s
WHERE s.status = 'needs_retry'
  AND s.admin_notes LIKE '%auto-healed: stuck in review%'
  AND s.updated_at > now() - interval '5 minutes';

CREATE OR REPLACE FUNCTION public.service_heal_stuck_face_verifications(_max_age_seconds int DEFAULT 120)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  healed int := 0;
BEGIN
  WITH stuck AS (
    SELECT id, user_id
    FROM public.face_verification_submissions
    WHERE status IN ('submitted','pending','under_review')
      AND updated_at < now() - make_interval(secs => _max_age_seconds)
  ), upd AS (
    UPDATE public.face_verification_submissions s
    SET status = 'needs_retry',
        rejection_reason = NULL,
        reviewed_at = NULL,
        admin_notes = COALESCE(s.admin_notes,'') || E'\n[needs_retry] auto-healed by service_heal_stuck_face_verifications',
        updated_at = now()
    FROM stuck
    WHERE s.id = stuck.id
    RETURNING s.id, s.user_id
  )
  SELECT count(*) INTO healed FROM upd;

  INSERT INTO public.notifications (user_id, type, title, message, data)
  SELECT s.user_id,
         'face_verification_retry',
         'Face Verification — Please Retry',
         'We could not finish reviewing your face verification. Please retake your photo, live face scan and intro video in good light and submit again.',
         jsonb_build_object('route','/face-verification','reason','auto_healed_stuck')
  FROM public.face_verification_submissions s
  WHERE s.status = 'needs_retry'
    AND s.admin_notes LIKE '%auto-healed by service_heal_stuck_face_verifications%'
    AND s.updated_at > now() - interval '1 minute';

  RETURN healed;
END;
$$;

REVOKE ALL ON FUNCTION public.service_heal_stuck_face_verifications(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.service_heal_stuck_face_verifications(int) TO service_role;
