-- 2026-07-03: Admin can wipe a user's face verification so the SAME face can
-- be re-verified on a different account (user mistakenly verified on wrong
-- account). Only callable inside an active admin session.

CREATE OR REPLACE FUNCTION public.admin_reset_user_face_verification(
  _user_id uuid,
  _reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_admin uuid;
  v_deleted_submissions int := 0;
  v_deleted_face_records int := 0;
  v_deleted_shards int := 0;
BEGIN
  IF NOT public.is_active_admin_session() THEN
    RAISE EXCEPTION 'Admin session required';
  END IF;

  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'user_id is required';
  END IF;

  BEGIN
    v_admin := public.current_admin_user_id();
  EXCEPTION WHEN OTHERS THEN
    v_admin := NULL;
  END;

  -- Wipe every face verification submission for this user.
  WITH d AS (
    DELETE FROM public.face_verification_submissions
    WHERE user_id = _user_id
    RETURNING 1
  )
  SELECT count(*) INTO v_deleted_submissions FROM d;

  -- Remove face-index entries used for duplicate detection (so the same face
  -- can be re-indexed under a different account without tripping the
  -- duplicate-face gate).
  BEGIN
    WITH d AS (DELETE FROM public.face_records WHERE user_id = _user_id RETURNING 1)
    SELECT count(*) INTO v_deleted_face_records FROM d;
  EXCEPTION WHEN undefined_table THEN v_deleted_face_records := 0;
  END;

  BEGIN
    WITH d AS (DELETE FROM public.rekognition_shards WHERE user_id = _user_id RETURNING 1)
    SELECT count(*) INTO v_deleted_shards FROM d;
  EXCEPTION WHEN undefined_table THEN v_deleted_shards := 0;
  END;

  -- Reset the profile's face-verification state.
  UPDATE public.profiles
  SET
    is_face_verified = false,
    face_verification_status = NULL,
    face_verification_image = NULL,
    face_verified_at = NULL,
    face_hash = NULL,
    updated_at = now()
  WHERE id = _user_id;

  -- Audit trail (best-effort; schema differences are non-fatal).
  BEGIN
    INSERT INTO public.admin_logs (admin_id, action, metadata)
    VALUES (
      v_admin,
      'face_verification_reset',
      jsonb_build_object(
        'user_id', _user_id,
        'reason', coalesce(_reason, ''),
        'deleted_submissions', v_deleted_submissions,
        'deleted_face_records', v_deleted_face_records,
        'deleted_shards', v_deleted_shards
      )
    );
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  RETURN jsonb_build_object(
    'success', true,
    'user_id', _user_id,
    'deleted_submissions', v_deleted_submissions,
    'deleted_face_records', v_deleted_face_records,
    'deleted_shards', v_deleted_shards
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_reset_user_face_verification(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_reset_user_face_verification(uuid, text) TO authenticated, service_role;