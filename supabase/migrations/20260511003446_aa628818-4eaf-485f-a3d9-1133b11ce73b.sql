CREATE OR REPLACE FUNCTION public.admin_process_face_verification(
  _submission_id uuid,
  _action text,
  _reason text DEFAULT NULL,
  _approve_as text DEFAULT 'host',
  _set_gender text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid;
  v_g text;
BEGIN
  IF NOT public.is_active_admin_session() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized');
  END IF;

  SELECT user_id INTO v_user FROM public.face_verification_submissions WHERE id = _submission_id;
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Submission not found');
  END IF;

  UPDATE public.face_verification_submissions
  SET
    status = CASE WHEN _action = 'approve' THEN 'approved' ELSE 'rejected' END,
    reviewed_by = public.current_admin_id_from_header(),
    reviewed_at = now(),
    admin_notes = COALESCE(_reason, admin_notes),
    rejection_reason = CASE WHEN _action = 'reject' THEN _reason ELSE rejection_reason END
  WHERE id = _submission_id;

  IF _action = 'approve' THEN
    v_g := lower(
      trim(
        COALESCE(
          NULLIF(trim(COALESCE(_set_gender, '')), ''),
          (SELECT lower(trim(COALESCE(p.gender, ''))) FROM public.profiles p WHERE p.id = v_user),
          'male'
        )
      )
    );
    IF v_g NOT IN ('female', 'male') THEN
      v_g := 'male';
    END IF;

    UPDATE public.face_verification_submissions
    SET verification_type = CASE WHEN v_g = 'female' THEN 'host' ELSE 'user' END,
        updated_at = now()
    WHERE id = _submission_id;

    UPDATE public.profiles
    SET
      is_face_verified = true,
      face_verified_at = now(),
      face_verification_status = 'approved',
      gender = v_g,
      is_host = (v_g = 'female'),
      host_status = CASE WHEN v_g = 'female' THEN 'approved' ELSE NULL END,
      updated_at = now()
    WHERE id = v_user;
  ELSE
    UPDATE public.profiles
    SET
      is_face_verified = false,
      face_verification_status = 'rejected',
      host_status = CASE WHEN is_host THEN 'rejected' ELSE host_status END,
      updated_at = now()
    WHERE id = v_user;
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;

COMMENT ON FUNCTION public.admin_process_face_verification(uuid, text, text, text, text) IS
  'Approve/reject face verification. On approve, gender = admin _set_gender or existing profile; is_host iff female; host_status cleared for male.';