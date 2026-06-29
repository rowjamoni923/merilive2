-- Face C-3: idempotency lock for face-verification-analyze concurrent invocations.
-- Returns true only if the caller successfully transitioned the row from a
-- non-terminal state into 'processing'. Subsequent concurrent callers get
-- false and short-circuit, preventing double Rekognition spend + double
-- auto-finalize on the same submission.
CREATE OR REPLACE FUNCTION public.try_lock_face_submission_for_analysis(p_submission_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _affected integer;
BEGIN
  UPDATE public.face_verification_submissions
     SET status = 'processing',
         updated_at = now()
   WHERE id = p_submission_id
     AND status IN ('pending','under_review','needs_retry','processing')
     AND (
       updated_at IS NULL
       OR status <> 'processing'
       OR updated_at < now() - interval '2 minutes'  -- stuck-lock recovery
     );
  GET DIAGNOSTICS _affected = ROW_COUNT;
  RETURN _affected > 0;
END;
$$;

REVOKE ALL ON FUNCTION public.try_lock_face_submission_for_analysis(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.try_lock_face_submission_for_analysis(uuid) TO service_role;