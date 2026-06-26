
-- 1) Drop orphan RPC (any signature)
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'auto_approve_face_verification'
  LOOP
    EXECUTE format('DROP FUNCTION IF EXISTS %I.%I(%s) CASCADE;', r.nspname, r.proname, r.args);
  END LOOP;
END $$;

-- 2) Patch manual finalize to keep profiles.face_verification_status in sync
CREATE OR REPLACE FUNCTION public.auto_finalize_face_verification(
  p_submission_id uuid,
  p_status text,
  p_reason text DEFAULT NULL,
  p_admin_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sub record;
  v_now timestamptz := now();
  v_profile_status text;
BEGIN
  SELECT * INTO v_sub FROM public.face_verification_submissions WHERE id = p_submission_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'submission_not_found');
  END IF;

  IF p_status NOT IN ('approved','rejected','under_review','pending') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_status');
  END IF;

  UPDATE public.face_verification_submissions
     SET status = p_status,
         rejection_reason = CASE WHEN p_status = 'rejected' THEN COALESCE(p_reason, rejection_reason) ELSE NULL END,
         reviewed_by = COALESCE(p_admin_id, reviewed_by),
         reviewed_at = CASE WHEN p_status IN ('approved','rejected') THEN v_now ELSE reviewed_at END,
         updated_at = v_now
   WHERE id = p_submission_id;

  v_profile_status := CASE
    WHEN p_status = 'approved'     THEN 'verified'
    WHEN p_status = 'rejected'     THEN 'rejected'
    WHEN p_status = 'under_review' THEN 'under_review'
    ELSE 'pending'
  END;

  UPDATE public.profiles
     SET face_verified = (p_status = 'approved'),
         face_verification_status = v_profile_status,
         face_verified_at = CASE WHEN p_status = 'approved' THEN v_now ELSE face_verified_at END,
         updated_at = v_now
   WHERE id = v_sub.user_id;

  RETURN jsonb_build_object('ok', true, 'status', p_status, 'profile_status', v_profile_status);
END;
$$;

-- 3) Ensure pending-sweep cron runs every minute
DO $$
DECLARE
  v_jobid bigint;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    SELECT jobid INTO v_jobid FROM cron.job WHERE jobname = 'sweep_pending_face_verifications';
    IF v_jobid IS NOT NULL THEN
      PERFORM cron.unschedule(v_jobid);
    END IF;
    PERFORM cron.schedule(
      'sweep_pending_face_verifications',
      '* * * * *',
      $cron$ SELECT public.sweep_pending_face_verifications(); $cron$
    );
  END IF;
END $$;
