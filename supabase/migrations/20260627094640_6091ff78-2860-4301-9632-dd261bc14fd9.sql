CREATE OR REPLACE FUNCTION public.service_heal_stuck_face_verifications(
  _max_age_seconds integer DEFAULT 180
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec record;
  reanalyzed int := 0;
  healed int := 0;
BEGIN
  FOR rec IN
    SELECT id, user_id
      FROM public.face_verification_submissions
     WHERE status IN ('submitted','pending','under_review')
       AND updated_at < now() - make_interval(secs => _max_age_seconds)
       AND COALESCE(admin_notes,'') NOT LIKE '%[heal-reanalyze]%'
  LOOP
    BEGIN
      PERFORM public._enqueue_face_analyze(rec.id);
      UPDATE public.face_verification_submissions
         SET admin_notes = concat_ws(E'\n', NULLIF(trim(coalesce(admin_notes,'')),''), '[heal-reanalyze] re-invoked face-verification-analyze'),
             updated_at = now()
       WHERE id = rec.id;
      reanalyzed := reanalyzed + 1;
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END LOOP;

  WITH stuck AS (
    SELECT id, user_id
      FROM public.face_verification_submissions
     WHERE status IN ('submitted','pending','under_review')
       AND updated_at < now() - make_interval(secs => _max_age_seconds)
       AND COALESCE(admin_notes,'') LIKE '%[heal-reanalyze]%'
  ), upd AS (
    UPDATE public.face_verification_submissions s
       SET status = 'needs_retry',
           rejection_reason = NULL,
           reviewed_at = NULL,
           admin_notes = concat_ws(E'\n', NULLIF(trim(coalesce(s.admin_notes,'')),''), '[needs_retry] auto-healed after analyzer re-invoke still pending'),
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
     AND s.admin_notes LIKE '%auto-healed after analyzer re-invoke still pending%'
     AND s.updated_at > now() - interval '1 minute';

  RETURN reanalyzed + healed;
END;
$$;

GRANT EXECUTE ON FUNCTION public.service_heal_stuck_face_verifications(integer) TO authenticated, service_role;