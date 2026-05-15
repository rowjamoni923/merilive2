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
  v_approve_as text;
  v_sub public.face_verification_submissions%ROWTYPE;
  v_face_url text;
  v_avatar_src text;
BEGIN
  PERFORM set_config('app.bypass_profile_protection','true',true);

  IF _action_type = 'add_diamonds' THEN
    v_user := (_payload->>'user_id')::uuid; v_amount := (_payload->>'amount')::int;
    UPDATE profiles SET coins = COALESCE(coins,0) + v_amount WHERE id = v_user;
    RETURN jsonb_build_object('success',true);

  ELSIF _action_type = 'add_beans' THEN
    v_user := (_payload->>'user_id')::uuid; v_amount := (_payload->>'amount')::int;
    UPDATE profiles SET beans = COALESCE(beans,0) + v_amount WHERE id = v_user;
    RETURN jsonb_build_object('success',true);

  ELSIF _action_type = 'agency_beans_adjust' THEN
    v_agency := (_payload->>'agency_id')::uuid; v_delta := (_payload->>'delta')::bigint;
    UPDATE agencies SET beans_balance = COALESCE(beans_balance,0) + v_delta WHERE id = v_agency;
    RETURN jsonb_build_object('success',true);

  ELSIF _action_type = 'update_gender' THEN
    v_user := (_payload->>'user_id')::uuid; v_gender := _payload->>'gender';
    IF v_gender NOT IN ('female','male') THEN RETURN jsonb_build_object('success',false,'error','Invalid gender'); END IF;
    UPDATE profiles SET gender = v_gender,
       is_host = CASE WHEN v_gender='female' THEN true ELSE false END,
       host_status = CASE WHEN v_gender='female' AND COALESCE(is_face_verified,false) THEN 'approved'
                          WHEN v_gender='female' THEN 'pending_face' ELSE NULL END,
       updated_at = now() WHERE id = v_user;
    RETURN jsonb_build_object('success',true);

  ELSIF _action_type = 'process_face_verification' THEN
    v_submission := (_payload->>'submission_id')::uuid;
    v_action := lower(trim(coalesce(_payload->>'action','')));
    v_reason := NULLIF(trim(coalesce(_payload->>'reason','')), '');
    v_set_gender := lower(trim(coalesce(_payload->>'set_gender','')));
    v_approve_as := lower(trim(coalesce(_payload->>'approve_as','')));

    SELECT * INTO v_sub FROM public.face_verification_submissions WHERE id = v_submission;
    IF NOT FOUND THEN RETURN jsonb_build_object('success',false,'error','Submission not found'); END IF;
    v_user := v_sub.user_id;

    IF v_action NOT IN ('approve','reject') THEN
      RETURN jsonb_build_object('success',false,'error','Invalid action');
    END IF;

    IF v_action = 'approve' THEN
      v_gender := COALESCE(NULLIF(v_set_gender,''), CASE WHEN v_approve_as = 'host' THEN 'female' WHEN v_approve_as = 'user' THEN 'male' ELSE NULL END,
                           (SELECT lower(trim(COALESCE(p.gender,''))) FROM profiles p WHERE p.id = v_user), 'male');
      IF v_gender NOT IN ('female','male') THEN v_gender := 'male'; END IF;
      v_approve_as := CASE WHEN v_gender='female' THEN 'host' ELSE 'user' END;
      v_face_url := COALESCE(v_sub.front_url, v_sub.selfie_url, v_sub.profile_photo_url, v_sub.face_image_url);
      v_avatar_src := COALESCE(v_sub.profile_photo_url, v_sub.front_url, v_sub.selfie_url);

      UPDATE public.face_verification_submissions
         SET status = 'approved',
             verification_type = v_approve_as,
             reviewed_by = current_admin_id_from_header(),
             reviewed_at = now(),
             admin_notes = COALESCE(v_reason, admin_notes),
             updated_at = now()
       WHERE id = v_submission;

      UPDATE public.profiles
         SET is_verified = true,
             is_face_verified = true,
             face_verified_at = now(),
             face_verification_status = 'approved',
             face_verification_image = COALESCE(v_face_url, face_verification_image),
             avatar_url = COALESCE(v_avatar_src, avatar_url),
             gender = v_gender,
             is_host = (v_gender='female'),
             host_status = CASE WHEN v_gender='female' THEN 'approved' ELSE NULL END,
             updated_at = now()
       WHERE id = v_user;
    ELSE
      UPDATE public.face_verification_submissions
         SET status = 'rejected',
             reviewed_by = current_admin_id_from_header(),
             reviewed_at = now(),
             admin_notes = COALESCE(v_reason, admin_notes),
             rejection_reason = COALESCE(v_reason, rejection_reason),
             updated_at = now()
       WHERE id = v_submission;

      UPDATE public.profiles
         SET is_face_verified = false,
             face_verification_image = NULL,
             face_verified_at = NULL,
             face_verification_status = 'rejected',
             host_status = CASE WHEN is_host THEN 'rejected' ELSE host_status END,
             updated_at = now()
       WHERE id = v_user;
    END IF;
    RETURN jsonb_build_object('success',true, 'gender', v_gender, 'verification_type', v_approve_as);

  ELSIF _action_type = 'remove_face_verification' THEN
    v_user := (_payload->>'user_id')::uuid;
    UPDATE face_verification_submissions
       SET status='rejected', reviewed_by=current_admin_id_from_header(), reviewed_at=now(),
           admin_notes = COALESCE(admin_notes,'') || E'\n[Revoked by admin]'
     WHERE user_id = v_user AND status IN ('approved','under_review');
    UPDATE profiles SET is_face_verified=false, face_verification_status='pending_face',
                        host_status = CASE WHEN is_host THEN 'pending_face' ELSE host_status END,
                        updated_at=now() WHERE id = v_user;
    RETURN jsonb_build_object('success',true);
  END IF;
  RAISE EXCEPTION 'Unknown action_type: %', _action_type;
END $function$;

CREATE OR REPLACE FUNCTION public.admin_process_face_verification(_submission_id uuid, _action text, _reason text DEFAULT NULL::text, _approve_as text DEFAULT 'host'::text, _set_gender text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_role text;
  v_pending uuid;
  v_user uuid;
BEGIN
  IF NOT is_active_admin_session() THEN RETURN jsonb_build_object('success',false,'error','Not authorized'); END IF;
  SELECT user_id INTO v_user FROM face_verification_submissions WHERE id = _submission_id;
  IF v_user IS NULL THEN RETURN jsonb_build_object('success',false,'error','Submission not found'); END IF;
  v_role := public._current_admin_role();
  IF v_role = 'sub_admin' THEN
    v_pending := public._enqueue_admin_pending_action('process_face_verification', v_user, NULL,
      jsonb_build_object('submission_id',_submission_id,'action',_action,'reason',_reason,'approve_as',_approve_as,'set_gender',_set_gender), _reason);
    RETURN jsonb_build_object('pending', true, 'request_id', v_pending);
  END IF;
  RETURN public._execute_admin_pending_action('process_face_verification',
    jsonb_build_object('submission_id',_submission_id,'action',_action,'reason',_reason,'approve_as',_approve_as,'set_gender',_set_gender));
END $function$;

CREATE OR REPLACE FUNCTION public.admin_face_verification_stats()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE r jsonb;
BEGIN
  IF NOT is_active_admin_session() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  SELECT jsonb_build_object(
    'pending', count(*) FILTER (WHERE status IN ('pending','submitted','under_review')),
    'submitted', count(*) FILTER (WHERE status='submitted'),
    'under_review', count(*) FILTER (WHERE status='under_review'),
    'approved', count(*) FILTER (WHERE status='approved'),
    'rejected', count(*) FILTER (WHERE status='rejected'),
    'total', count(*)
  ) INTO r FROM face_verification_submissions;
  RETURN r;
END $function$;