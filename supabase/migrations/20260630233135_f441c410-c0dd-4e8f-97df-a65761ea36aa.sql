-- 1) Allow re-verify
CREATE OR REPLACE FUNCTION public.support_allow_host_reapply(_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_face_reset int := 0;
  v_host_app_reset int := 0;
BEGIN
  IF NOT (public.is_active_admin_session() OR public.is_admin(auth.uid())) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  PERFORM set_config('app.bypass_profile_protection', 'true', true);

  WITH upd AS (
    UPDATE public.face_verification_submissions
    SET status = 'reset',
        updated_at = now(),
        admin_notes = COALESCE(admin_notes,'') || E'\n[support_allow_host_reapply ' || now()::text || ']'
    WHERE user_id = _user_id
      AND status IN ('rejected','removed','needs_retry')
    RETURNING 1
  )
  SELECT count(*) INTO v_face_reset FROM upd;

  WITH upd AS (
    UPDATE public.host_applications
    SET status = 'reset',
        reviewed_at = now(),
        rejection_reason = NULL
    WHERE user_id = _user_id
      AND status = 'rejected'
    RETURNING 1
  )
  SELECT count(*) INTO v_host_app_reset FROM upd;

  UPDATE public.profiles
  SET host_status = CASE WHEN gender = 'female' THEN 'pending_face' ELSE NULL END,
      is_face_verified = false,
      face_verification_status = NULL,
      updated_at = now()
  WHERE id = _user_id
    AND COALESCE(is_face_verified, false) = false;

  BEGIN
    INSERT INTO public.notifications (user_id, title, message, type)
    VALUES (_user_id,
            'You can verify again',
            'Support has reopened your face verification. Please submit a fresh application from your profile.',
            'system');
  EXCEPTION WHEN OTHERS THEN NULL; END;

  BEGIN
    INSERT INTO public.admin_logs (admin_id, action_type, target_type, target_id, details)
    VALUES (auth.uid(), 'support_allow_host_reapply', 'profile', _user_id::text,
            jsonb_build_object('face_rows_reset', v_face_reset,
                               'host_app_rows_reset', v_host_app_reset,
                               'admin_user_id', public.current_admin_id_from_header()));
  EXCEPTION WHEN OTHERS THEN NULL; END;

  RETURN jsonb_build_object('success', true,
                            'face_rows_reset', v_face_reset,
                            'host_app_rows_reset', v_host_app_reset);
END;
$$;

GRANT EXECUTE ON FUNCTION public.support_allow_host_reapply(uuid) TO authenticated, anon, service_role;


-- 2) Approve face verification from support ticket
CREATE OR REPLACE FUNCTION public.support_approve_face_verification(_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_face_img text;
BEGIN
  IF NOT (public.is_active_admin_session() OR public.is_admin(auth.uid())) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  PERFORM set_config('app.bypass_profile_protection', 'true', true);

  WITH latest AS (
    SELECT id, face_image_url
    FROM public.face_verification_submissions
    WHERE user_id = _user_id
    ORDER BY created_at DESC
    LIMIT 1
  )
  UPDATE public.face_verification_submissions s
  SET status = 'approved',
      rejection_reason = NULL,
      reviewed_at = now(),
      reviewed_by = auth.uid(),
      updated_at = now(),
      admin_notes = COALESCE(s.admin_notes,'') || E'\n[support_approve_face_verification ' || now()::text || ']'
  FROM latest l
  WHERE s.id = l.id
  RETURNING l.face_image_url INTO v_face_img;

  UPDATE public.profiles
  SET is_face_verified = true,
      is_verified = true,
      face_verified_at = COALESCE(face_verified_at, now()),
      face_verification_status = 'approved',
      face_verification_image = COALESCE(face_verification_image, v_face_img),
      host_status = CASE
        WHEN COALESCE(is_host, false) OR gender = 'female' THEN 'approved'
        ELSE host_status
      END,
      updated_at = now()
  WHERE id = _user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  BEGIN
    INSERT INTO public.notifications (user_id, title, message, type)
    VALUES (_user_id,
            'Face verification approved',
            'Support has approved your face verification. You can now go live and receive calls.',
            'system');
  EXCEPTION WHEN OTHERS THEN NULL; END;

  BEGIN
    INSERT INTO public.admin_logs (admin_id, action_type, target_type, target_id, details)
    VALUES (auth.uid(), 'support_approve_face_verification', 'profile', _user_id::text,
            jsonb_build_object('admin_user_id', public.current_admin_id_from_header()));
  EXCEPTION WHEN OTHERS THEN NULL; END;

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.support_approve_face_verification(uuid) TO authenticated, anon, service_role;


-- 3) One-shot cleanup: reset rejected host_applications + their profile gates,
--    wrapped so the protect_sensitive_profile_columns trigger lets us through.
DO $$
BEGIN
  PERFORM set_config('app.bypass_profile_protection', 'true', true);

  UPDATE public.host_applications
     SET status = 'reset',
         rejection_reason = NULL,
         reviewed_at = now()
   WHERE status = 'rejected';

  UPDATE public.profiles p
     SET host_status = CASE WHEN gender = 'female' THEN 'pending_face' ELSE NULL END,
         updated_at = now()
   WHERE COALESCE(p.is_face_verified, false) = false
     AND host_status = 'rejected';
END $$;
