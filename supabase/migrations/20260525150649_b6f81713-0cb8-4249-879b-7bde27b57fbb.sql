-- Pkg341 pass-2: close remaining User/Host/Agency management admin gates

CREATE OR REPLACE FUNCTION public._p341_assert_admin_can_target_user(
  _user_id uuid,
  _sections text[],
  _require_edit boolean DEFAULT true,
  _protect_owner boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF public.current_admin_id_from_header() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Admin session required');
  END IF;

  IF NOT public.admin_has_any_section_permission(_sections, _require_edit) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient section permission');
  END IF;

  IF _protect_owner AND public._is_target_user_owner(_user_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot target an owner account');
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_update_user_gender(_user_id uuid, _gender text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_role text;
  v_pending uuid;
  v_guard jsonb;
BEGIN
  v_guard := public._p341_assert_admin_can_target_user(
    _user_id,
    ARRAY['user-management','host-applications','face-verification','all-hosts'],
    true,
    true
  );
  IF NOT COALESCE((v_guard->>'success')::boolean, false) THEN
    RETURN v_guard;
  END IF;

  IF _gender NOT IN ('female','male') THEN
    RETURN jsonb_build_object('success',false,'error','Invalid gender');
  END IF;

  v_role := public.current_effective_admin_role();
  IF v_role = 'sub_admin' THEN
    v_pending := public._enqueue_admin_pending_action('update_gender', _user_id, NULL,
      jsonb_build_object('user_id',_user_id,'gender',_gender), NULL);
    RETURN jsonb_build_object('pending', true, 'request_id', v_pending);
  END IF;

  RETURN public._execute_admin_pending_action('update_gender', jsonb_build_object('user_id',_user_id,'gender',_gender));
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_toggle_face_verification(_user_id uuid, _verified boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_pending uuid;
  v_guard jsonb;
BEGIN
  v_guard := public._p341_assert_admin_can_target_user(
    _user_id,
    ARRAY['face-verification','host-applications','user-management'],
    true,
    true
  );
  IF NOT COALESCE((v_guard->>'success')::boolean, false) THEN
    RETURN v_guard;
  END IF;

  IF public.current_effective_admin_role() = 'sub_admin' THEN
    IF _verified IS FALSE THEN
      v_pending := public._enqueue_admin_pending_action('remove_face_verification', _user_id, NULL, jsonb_build_object('user_id', _user_id), NULL);
      RETURN jsonb_build_object('pending', true, 'request_id', v_pending);
    END IF;
    RETURN jsonb_build_object('success',false,'error','Owner approval required');
  END IF;

  PERFORM set_config('app.bypass_profile_protection','true',true);
  UPDATE public.profiles
     SET is_face_verified = _verified,
         face_verified_at = CASE WHEN _verified THEN now() ELSE NULL END,
         face_verification_status = CASE WHEN _verified THEN 'approved' ELSE 'pending_face' END,
         host_status = CASE
           WHEN _verified AND is_host THEN 'approved'
           WHEN NOT _verified AND is_host THEN 'pending_face'
           ELSE host_status END,
         updated_at = now()
   WHERE id = _user_id;
  PERFORM set_config('app.bypass_profile_protection','false',true);

  IF NOT FOUND THEN RETURN jsonb_build_object('success',false,'error','User not found'); END IF;
  RETURN jsonb_build_object('success',true);
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_process_face_verification(
  _submission_id uuid,
  _action text,
  _reason text DEFAULT NULL::text,
  _approve_as text DEFAULT 'host'::text,
  _set_gender text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_role text;
  v_pending uuid;
  v_user uuid;
  v_guard jsonb;
BEGIN
  SELECT user_id INTO v_user FROM public.face_verification_submissions WHERE id = _submission_id;
  IF v_user IS NULL THEN RETURN jsonb_build_object('success',false,'error','Submission not found'); END IF;

  v_guard := public._p341_assert_admin_can_target_user(
    v_user,
    ARRAY['face-verification','host-applications','user-management'],
    true,
    true
  );
  IF NOT COALESCE((v_guard->>'success')::boolean, false) THEN
    RETURN v_guard;
  END IF;

  IF lower(trim(coalesce(_action,''))) NOT IN ('approve','reject') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid face verification action');
  END IF;

  v_role := public._current_admin_role();
  IF v_role = 'sub_admin' THEN
    v_pending := public._enqueue_admin_pending_action('process_face_verification', v_user, NULL,
      jsonb_build_object('submission_id',_submission_id,'action',lower(trim(_action)),'reason',_reason,'approve_as',_approve_as,'set_gender',_set_gender), _reason);
    RETURN jsonb_build_object('pending', true, 'request_id', v_pending);
  END IF;

  RETURN public._execute_admin_pending_action('process_face_verification',
    jsonb_build_object('submission_id',_submission_id,'action',lower(trim(_action)),'reason',_reason,'approve_as',_approve_as,'set_gender',_set_gender));
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_force_verify_and_approve_host(
  _user_id uuid,
  _approve_as text DEFAULT 'host'::text,
  _set_gender text DEFAULT NULL::text,
  _reason text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _caller_id uuid;
  _reviewer_id uuid;
  _existing RECORD;
  _final_gender text;
  _final_role text;
  _face_url text;
  _safe_url text;
  _submission_id uuid;
  v_guard jsonb;
BEGIN
  v_guard := public._p341_assert_admin_can_target_user(
    _user_id,
    ARRAY['face-verification','host-applications','user-management'],
    true,
    true
  );
  IF NOT COALESCE((v_guard->>'success')::boolean, false) THEN
    RETURN v_guard;
  END IF;

  _caller_id := public.current_admin_id_from_header();
  _reviewer_id := public.current_admin_reviewer_auth_id();
  _final_role := CASE WHEN lower(trim(coalesce(_approve_as,''))) = 'user' THEN 'user' ELSE 'host' END;

  SELECT id, gender, avatar_url, face_verification_image
    INTO _existing FROM public.profiles WHERE id = _user_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'User profile not found'); END IF;

  _final_gender := COALESCE(NULLIF(lower(trim(coalesce(_set_gender, ''))), ''), CASE WHEN _final_role = 'host' THEN 'female' ELSE 'male' END);
  IF _final_gender NOT IN ('female','male') THEN _final_gender := CASE WHEN _final_role = 'host' THEN 'female' ELSE 'male' END; END IF;
  _final_role := CASE WHEN _final_gender = 'female' THEN 'host' ELSE 'user' END;
  _face_url := COALESCE(_existing.face_verification_image, _existing.avatar_url);
  _safe_url := COALESCE(_face_url, 'admin-approved://no-image');

  PERFORM set_config('app.bypass_profile_protection', 'true', true);

  UPDATE public.profiles
     SET is_verified = true,
         is_face_verified = true,
         face_verification_image = COALESCE(_face_url, face_verification_image),
         face_verified_at = now(),
         gender = _final_gender,
         is_host = (_final_role = 'host'),
         host_status = CASE WHEN _final_role = 'host' THEN 'approved' ELSE NULL END,
         updated_at = now()
   WHERE id = _user_id;

  UPDATE public.face_verification_submissions
     SET status = 'approved', verification_type = _final_role,
         reviewed_by = _reviewer_id, reviewed_at = now(),
         admin_notes = COALESCE(_reason, admin_notes, 'Admin force-approved'),
         rejection_reason = NULL,
         updated_at = now()
   WHERE user_id = _user_id AND public.face_verification_status_bucket(status) = 'pending';

  IF NOT EXISTS (SELECT 1 FROM public.face_verification_submissions WHERE user_id = _user_id AND public.face_verification_status_bucket(status) = 'approved') THEN
    INSERT INTO public.face_verification_submissions
      (user_id, status, verification_type, face_image_url, selfie_url,
       reviewed_by, reviewed_at, admin_notes, created_at, updated_at)
    VALUES
      (_user_id, 'approved', _final_role, _safe_url, _safe_url,
       _reviewer_id, now(), COALESCE(_reason, 'Admin direct approval (no submission)'), now(), now())
    RETURNING id INTO _submission_id;
  END IF;

  INSERT INTO public.notifications (user_id, title, message, type, data)
  VALUES (_user_id, '✅ Verification Approved!',
    'Your account has been verified by admin' ||
      CASE WHEN _final_role = 'host' THEN ' and approved as a Host. You can now go live!' ELSE '.' END,
    'face_verification_approved',
    jsonb_build_object('approved_as', _final_role, 'gender', _final_gender, 'forced', true));

  PERFORM public.log_admin_action('force_verify_approve_host', 'profile', _user_id::text,
    jsonb_build_object('approve_as', _final_role, 'gender', _final_gender, 'reason', _reason, 'admin_id', _caller_id));

  PERFORM set_config('app.bypass_profile_protection', 'false', true);

  RETURN jsonb_build_object('success', true, 'user_id', _user_id,
    'approved_as', _final_role, 'gender', _final_gender, 'submission_id', _submission_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_process_host_application(_application_id uuid, _status text, _processed_by uuid DEFAULT NULL::uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _application RECORD;
  _user_id uuid;
  _clean_status text;
  v_guard jsonb;
BEGIN
  SELECT * INTO _application FROM public.host_applications WHERE id = _application_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Application not found');
  END IF;

  _user_id := _application.user_id;
  v_guard := public._p341_assert_admin_can_target_user(
    _user_id,
    ARRAY['host-applications','user-management','all-hosts'],
    true,
    true
  );
  IF NOT COALESCE((v_guard->>'success')::boolean, false) THEN
    RETURN v_guard;
  END IF;

  _clean_status := lower(trim(coalesce(_status, '')));
  IF _clean_status NOT IN ('approved', 'rejected', 'pending') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid status');
  END IF;

  UPDATE public.host_applications
  SET status      = _clean_status,
      reviewed_by = public.current_admin_reviewer_auth_id(),
      reviewed_at = now(),
      updated_at  = now()
  WHERE id = _application_id;

  PERFORM set_config('app.bypass_profile_protection', 'true', true);

  IF _clean_status = 'approved' THEN
    UPDATE public.profiles
    SET is_host = true, host_status = 'approved', updated_at = now()
    WHERE id = _user_id;
  ELSIF _clean_status = 'rejected' THEN
    UPDATE public.profiles
    SET host_status = 'rejected', updated_at = now()
    WHERE id = _user_id;
  END IF;

  PERFORM set_config('app.bypass_profile_protection', 'false', true);

  PERFORM public.log_admin_action('process_host_application', 'host_application', _application_id,
    jsonb_build_object('status', _clean_status, 'user_id', _user_id, 'admin_id', public.current_admin_id_from_header()));

  RETURN jsonb_build_object('success', true, 'status', _clean_status);
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_remove_host_from_agency(_host_id uuid, _reason text DEFAULT NULL::text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _agency_id uuid;
BEGIN
  IF public.current_admin_id_from_header() IS NULL THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF NOT public.admin_has_any_section_permission(ARRAY['agency-management','all-hosts','user-management'], true) THEN
    RAISE EXCEPTION 'Insufficient section permission';
  END IF;
  IF public._is_target_user_owner(_host_id) THEN
    RAISE EXCEPTION 'Cannot target an owner account';
  END IF;

  SELECT agency_id INTO _agency_id FROM public.agency_hosts WHERE host_id = _host_id AND status = 'active';
  IF _agency_id IS NULL THEN RETURN FALSE; END IF;

  UPDATE public.agency_hosts SET status = 'removed', left_at = now() WHERE host_id = _host_id AND agency_id = _agency_id;

  PERFORM set_config('app.bypass_profile_protection', 'true', true);
  UPDATE public.profiles SET agency_id = NULL WHERE id = _host_id;
  PERFORM set_config('app.bypass_profile_protection', 'false', true);

  UPDATE public.agencies SET total_hosts = GREATEST(COALESCE(total_hosts, 0) - 1, 0) WHERE id = _agency_id;
  PERFORM public.log_admin_action('remove_host_from_agency', 'host', _host_id, jsonb_build_object('agency_id', _agency_id, 'reason', _reason, 'admin_id', public.current_admin_id_from_header()));
  RETURN TRUE;
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_update_user_report(_admin_id uuid, _report_id uuid, _status text, _admin_note text DEFAULT NULL::text)
RETURNS public.user_reports
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  r public.user_reports;
  v_admin uuid;
  v_status text;
BEGIN
  v_admin := public.current_admin_id_from_header();
  IF v_admin IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  IF NOT public.admin_has_any_section_permission(ARRAY['user-reports','support-reports','user-management'], true) THEN
    RAISE EXCEPTION 'Insufficient section permission';
  END IF;

  v_status := lower(trim(coalesce(_status, '')));
  IF v_status NOT IN ('pending','reviewed','resolved','dismissed','closed') THEN
    RAISE EXCEPTION 'Invalid report status';
  END IF;

  UPDATE public.user_reports
     SET status = v_status,
         admin_notes = COALESCE(_admin_note, admin_notes),
         reviewed_at = now(),
         reviewed_by = v_admin
   WHERE id = _report_id
   RETURNING * INTO r;

  IF r.id IS NULL THEN RAISE EXCEPTION 'Report not found'; END IF;
  RETURN r;
END;
$function$;

-- Harden the central pending-action executor so even owner approval paths cannot target owner accounts.
CREATE OR REPLACE FUNCTION public._execute_admin_pending_action(_action_type text, _payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid;
  v_amount integer;
  v_agency uuid;
  v_delta bigint;
  v_gender text;
  v_submission uuid;
  v_action text;
  v_reason text;
  v_set_gender text;
  v_role text := public.current_effective_admin_role();
  v_is_service boolean := COALESCE(current_setting('request.jwt.claim.role', true), '') = 'service_role';
BEGIN
  IF NOT v_is_service AND v_role <> 'owner' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Owner approval required');
  END IF;

  IF _action_type NOT IN (
    'add_diamonds', 'add_beans', 'agency_beans_adjust', 'update_gender',
    'process_face_verification', 'remove_face_verification', 'reverse_auto_action'
  ) THEN
    RAISE EXCEPTION 'Unknown action_type: %', _action_type;
  END IF;

  IF _action_type = 'add_diamonds' THEN
    v_user := (_payload->>'user_id')::uuid;
    v_amount := (_payload->>'amount')::int;
    IF v_user IS NULL OR v_amount IS NULL OR v_amount = 0 OR abs(v_amount) > 10000000 THEN
      RETURN jsonb_build_object('success', false, 'error', 'Invalid diamond amount');
    END IF;
    PERFORM set_config('app.bypass_profile_protection','true',true);
    UPDATE public.profiles SET coins = GREATEST(COALESCE(coins,0) + v_amount, 0), updated_at = now() WHERE id = v_user;
    PERFORM set_config('app.bypass_profile_protection','false',true);
    RETURN jsonb_build_object('success',true);

  ELSIF _action_type = 'add_beans' THEN
    v_user := (_payload->>'user_id')::uuid;
    v_amount := (_payload->>'amount')::int;
    IF v_user IS NULL OR v_amount IS NULL OR v_amount = 0 OR abs(v_amount) > 10000000 THEN
      RETURN jsonb_build_object('success', false, 'error', 'Invalid bean amount');
    END IF;
    PERFORM set_config('app.bypass_profile_protection','true',true);
    UPDATE public.profiles SET beans = GREATEST(COALESCE(beans,0) + v_amount, 0), updated_at = now() WHERE id = v_user;
    PERFORM set_config('app.bypass_profile_protection','false',true);
    RETURN jsonb_build_object('success',true);

  ELSIF _action_type = 'agency_beans_adjust' THEN
    v_agency := (_payload->>'agency_id')::uuid;
    v_delta := (_payload->>'delta')::bigint;
    IF v_agency IS NULL OR v_delta IS NULL OR v_delta = 0 OR abs(v_delta) > 1000000000 THEN
      RETURN jsonb_build_object('success', false, 'error', 'Invalid agency bean adjustment');
    END IF;
    PERFORM set_config('app.bypass_agency_economy_guard','true',true);
    UPDATE public.agencies SET beans_balance = GREATEST(COALESCE(beans_balance,0) + v_delta, 0), updated_at = now() WHERE id = v_agency;
    PERFORM set_config('app.bypass_agency_economy_guard','false',true);
    RETURN jsonb_build_object('success',true);

  ELSIF _action_type = 'update_gender' THEN
    v_user := (_payload->>'user_id')::uuid;
    v_gender := _payload->>'gender';
    IF v_user IS NULL OR v_gender NOT IN ('female','male') THEN RETURN jsonb_build_object('success',false,'error','Invalid gender'); END IF;
    IF public._is_target_user_owner(v_user) THEN RETURN jsonb_build_object('success',false,'error','Cannot target an owner account'); END IF;
    PERFORM set_config('app.bypass_profile_protection','true',true);
    UPDATE public.profiles SET gender = v_gender,
       is_host = CASE WHEN v_gender='female' THEN true ELSE false END,
       host_status = CASE WHEN v_gender='female' AND COALESCE(is_face_verified,false) THEN 'approved'
                          WHEN v_gender='female' THEN 'pending_face' ELSE NULL END,
       updated_at = now() WHERE id = v_user;
    PERFORM set_config('app.bypass_profile_protection','false',true);
    RETURN jsonb_build_object('success',true);

  ELSIF _action_type = 'process_face_verification' THEN
    v_submission := (_payload->>'submission_id')::uuid;
    v_action := _payload->>'action';
    v_reason := _payload->>'reason';
    v_set_gender := _payload->>'set_gender';
    IF v_submission IS NULL OR v_action NOT IN ('approve','reject') THEN
      RETURN jsonb_build_object('success', false, 'error', 'Invalid face verification action');
    END IF;
    SELECT user_id INTO v_user FROM public.face_verification_submissions WHERE id = v_submission;
    IF v_user IS NULL THEN RETURN jsonb_build_object('success',false,'error','Submission not found'); END IF;
    IF public._is_target_user_owner(v_user) THEN RETURN jsonb_build_object('success',false,'error','Cannot target an owner account'); END IF;

    UPDATE public.face_verification_submissions
       SET status = CASE WHEN v_action='approve' THEN 'approved' ELSE 'rejected' END,
           reviewed_by = public.current_admin_reviewer_auth_id(), reviewed_at = now(),
           admin_notes = COALESCE(v_reason, admin_notes),
           rejection_reason = CASE WHEN v_action='reject' THEN v_reason ELSE rejection_reason END,
           updated_at = now()
     WHERE id = v_submission;

    PERFORM set_config('app.bypass_profile_protection','true',true);
    IF v_action='approve' THEN
      v_gender := lower(trim(COALESCE(NULLIF(trim(COALESCE(v_set_gender,'')),''),
                  (SELECT lower(trim(COALESCE(p.gender,''))) FROM public.profiles p WHERE p.id = v_user),'male')));
      IF v_gender NOT IN ('female','male') THEN v_gender := 'male'; END IF;
      UPDATE public.face_verification_submissions
         SET verification_type = CASE WHEN v_gender='female' THEN 'host' ELSE 'user' END, updated_at = now()
       WHERE id = v_submission;
      UPDATE public.profiles SET is_face_verified=true, face_verified_at=now(), face_verification_status='approved',
                          gender=v_gender, is_host=(v_gender='female'),
                          host_status = CASE WHEN v_gender='female' THEN 'approved' ELSE NULL END,
                          updated_at=now() WHERE id = v_user;
    ELSE
      UPDATE public.profiles SET is_face_verified=false, face_verification_status='rejected',
                          host_status = CASE WHEN is_host THEN 'rejected' ELSE host_status END,
                          updated_at=now() WHERE id = v_user;
    END IF;
    PERFORM set_config('app.bypass_profile_protection','false',true);
    RETURN jsonb_build_object('success',true);

  ELSIF _action_type = 'remove_face_verification' THEN
    v_user := (_payload->>'user_id')::uuid;
    IF v_user IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Invalid user'); END IF;
    IF public._is_target_user_owner(v_user) THEN RETURN jsonb_build_object('success',false,'error','Cannot target an owner account'); END IF;
    UPDATE public.face_verification_submissions
       SET status='rejected', reviewed_by=public.current_admin_reviewer_auth_id(), reviewed_at=now(),
           admin_notes = COALESCE(admin_notes,'') || E'\n[Revoked by admin]', updated_at = now()
     WHERE user_id = v_user AND status IN ('approved','under_review');
    PERFORM set_config('app.bypass_profile_protection','true',true);
    UPDATE public.profiles SET is_face_verified=false, face_verification_status='pending_face',
                        host_status = CASE WHEN is_host THEN 'pending_face' ELSE host_status END,
                        updated_at=now() WHERE id = v_user;
    PERFORM set_config('app.bypass_profile_protection','false',true);
    RETURN jsonb_build_object('success',true);

  ELSIF _action_type = 'reverse_auto_action' THEN
    RETURN public._do_reverse_auto_action(
      _payload->>'action_type',
      (_payload->>'action_id')::uuid,
      _payload->>'reason',
      public.current_admin_id_from_header()
    );
  END IF;

  RAISE EXCEPTION 'Unknown action_type: %', _action_type;
END;
$function$;

REVOKE ALL ON FUNCTION public._p341_assert_admin_can_target_user(uuid, text[], boolean, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._p341_assert_admin_can_target_user(uuid, text[], boolean, boolean) TO authenticated;

REVOKE ALL ON FUNCTION public.admin_force_verify_and_approve_host(uuid, text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_process_host_application(uuid, text, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_remove_host_from_agency(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_force_verify_and_approve_host(uuid, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_process_host_application(uuid, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_remove_host_from_agency(uuid, text) TO authenticated;