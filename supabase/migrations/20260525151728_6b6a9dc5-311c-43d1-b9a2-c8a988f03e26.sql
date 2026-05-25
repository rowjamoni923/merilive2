-- Pkg341 final pass: RPC-only admin mutations for remaining User/Host/Agency UI paths

CREATE OR REPLACE FUNCTION public.admin_set_user_verification(_user_id uuid, _verified boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_guard jsonb;
BEGIN
  v_guard := public._p341_assert_admin_can_target_user(
    _user_id,
    ARRAY['user-management','face-verification','host-applications'],
    true,
    true
  );
  IF NOT COALESCE((v_guard->>'success')::boolean, false) THEN
    RETURN v_guard;
  END IF;

  PERFORM set_config('app.bypass_profile_protection','true',true);
  UPDATE public.profiles
     SET is_verified = _verified,
         updated_at = now()
   WHERE id = _user_id;
  PERFORM set_config('app.bypass_profile_protection','false',true);

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'User not found');
  END IF;

  PERFORM public.log_admin_action(
    'set_user_verification', 'profile', _user_id::text,
    jsonb_build_object('verified', _verified, 'admin_id', public.current_admin_id_from_header())
  );

  RETURN jsonb_build_object('success', true, 'verified', _verified);
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_reset_phone_violation_count(_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_guard jsonb;
BEGIN
  v_guard := public._p341_assert_admin_can_target_user(
    _user_id,
    ARRAY['user-management','user-reports','support-reports'],
    true,
    true
  );
  IF NOT COALESCE((v_guard->>'success')::boolean, false) THEN
    RETURN v_guard;
  END IF;

  PERFORM set_config('app.bypass_profile_protection','true',true);
  UPDATE public.profiles
     SET phone_violation_count = 0,
         updated_at = now()
   WHERE id = _user_id;
  PERFORM set_config('app.bypass_profile_protection','false',true);

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'User not found');
  END IF;

  PERFORM public.log_admin_action(
    'reset_phone_violation_count', 'profile', _user_id::text,
    jsonb_build_object('admin_id', public.current_admin_id_from_header())
  );

  RETURN jsonb_build_object('success', true);
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_mark_face_submission_under_review(_submission_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid;
  v_guard jsonb;
BEGIN
  SELECT user_id INTO v_user
  FROM public.face_verification_submissions
  WHERE id = _submission_id;

  IF v_user IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Submission not found');
  END IF;

  v_guard := public._p341_assert_admin_can_target_user(
    v_user,
    ARRAY['face-verification','host-applications','user-management'],
    true,
    true
  );
  IF NOT COALESCE((v_guard->>'success')::boolean, false) THEN
    RETURN v_guard;
  END IF;

  UPDATE public.face_verification_submissions
     SET status = 'under_review',
         reviewed_by = public.current_admin_reviewer_auth_id(),
         updated_at = now()
   WHERE id = _submission_id
     AND public.face_verification_status_bucket(status) = 'pending';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Submission is not pending');
  END IF;

  PERFORM public.log_admin_action(
    'mark_face_submission_under_review', 'face_verification_submission', _submission_id::text,
    jsonb_build_object('user_id', v_user, 'admin_id', public.current_admin_id_from_header())
  );

  RETURN jsonb_build_object('success', true);
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_review_host_application(
  _application_id uuid,
  _status text,
  _admin_notes text DEFAULT NULL::text,
  _rejection_reason text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_application public.host_applications%ROWTYPE;
  v_status text;
  v_guard jsonb;
BEGIN
  SELECT * INTO v_application
  FROM public.host_applications
  WHERE id = _application_id;

  IF v_application.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Application not found');
  END IF;

  v_guard := public._p341_assert_admin_can_target_user(
    v_application.user_id,
    ARRAY['host-applications','user-management','all-hosts'],
    true,
    true
  );
  IF NOT COALESCE((v_guard->>'success')::boolean, false) THEN
    RETURN v_guard;
  END IF;

  v_status := lower(trim(coalesce(_status, '')));
  IF v_status NOT IN ('approved','rejected','pending','under_review') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid application status');
  END IF;
  IF v_status = 'rejected' AND NULLIF(trim(coalesce(_rejection_reason,'')), '') IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Rejection reason required');
  END IF;

  UPDATE public.host_applications
     SET status = v_status,
         reviewed_by = CASE WHEN v_status IN ('approved','rejected') THEN public.current_admin_reviewer_auth_id() ELSE reviewed_by END,
         reviewed_at = CASE WHEN v_status IN ('approved','rejected') THEN now() ELSE reviewed_at END,
         admin_notes = COALESCE(NULLIF(trim(coalesce(_admin_notes,'')), ''), admin_notes),
         rejection_reason = CASE WHEN v_status = 'rejected' THEN _rejection_reason ELSE NULL END,
         updated_at = now()
   WHERE id = _application_id;

  PERFORM set_config('app.bypass_profile_protection','true',true);
  IF v_status = 'approved' THEN
    UPDATE public.profiles
       SET gender = 'female',
           is_host = true,
           host_status = 'approved',
           is_face_verified = true,
           is_verified = true,
           face_verified_at = COALESCE(face_verified_at, now()),
           face_verification_status = 'approved',
           host_level = GREATEST(COALESCE(host_level, 0), 1),
           updated_at = now()
     WHERE id = v_application.user_id;
  ELSIF v_status = 'rejected' THEN
    UPDATE public.profiles
       SET host_status = 'rejected',
           updated_at = now()
     WHERE id = v_application.user_id;
  END IF;
  PERFORM set_config('app.bypass_profile_protection','false',true);

  PERFORM public.log_admin_action(
    'review_host_application', 'host_application', _application_id::text,
    jsonb_build_object('status', v_status, 'user_id', v_application.user_id, 'admin_id', public.current_admin_id_from_header())
  );

  RETURN jsonb_build_object('success', true, 'status', v_status, 'user_id', v_application.user_id);
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_set_user_verification(uuid, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_reset_phone_violation_count(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_mark_face_submission_under_review(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_review_host_application(uuid, text, text, text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.admin_set_user_verification(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_reset_phone_violation_count(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_mark_face_submission_under_review(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_review_host_application(uuid, text, text, text) TO authenticated;