CREATE OR REPLACE FUNCTION public.current_admin_reviewer_auth_id()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_auth_uid uuid;
  v_admin_id uuid;
  v_admin_user_id uuid;
BEGIN
  v_auth_uid := auth.uid();
  IF v_auth_uid IS NOT NULL AND EXISTS (SELECT 1 FROM auth.users u WHERE u.id = v_auth_uid) THEN
    RETURN v_auth_uid;
  END IF;

  v_admin_id := public.current_admin_id_from_header();
  IF v_admin_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT au.user_id
    INTO v_admin_user_id
  FROM public.admin_users au
  JOIN auth.users u ON u.id = au.user_id
  WHERE au.id = v_admin_id
    AND COALESCE(au.is_active, true) = true
  LIMIT 1;

  IF v_admin_user_id IS NOT NULL THEN
    RETURN v_admin_user_id;
  END IF;

  IF EXISTS (SELECT 1 FROM auth.users u WHERE u.id = v_admin_id) THEN
    RETURN v_admin_id;
  END IF;

  RETURN NULL;
END;
$function$;

CREATE OR REPLACE FUNCTION public._execute_admin_pending_action(_action_type text, _payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid; v_amount integer; v_agency uuid; v_delta bigint;
  v_gender text; v_submission uuid; v_action text; v_reason text;
  v_set_gender text; v_approve_as text;
  v_sub public.face_verification_submissions%ROWTYPE;
  v_face_url text; v_avatar_src text;
  v_reviewer uuid;
BEGIN
  PERFORM set_config('app.bypass_profile_protection','true',true);
  v_reviewer := public.current_admin_reviewer_auth_id();

  IF _action_type='add_diamonds' THEN
    v_user:=(_payload->>'user_id')::uuid; v_amount:=(_payload->>'amount')::int;
    UPDATE public.profiles SET coins=COALESCE(coins,0)+v_amount WHERE id=v_user;
    RETURN jsonb_build_object('success',true);

  ELSIF _action_type='add_beans' THEN
    v_user:=(_payload->>'user_id')::uuid; v_amount:=(_payload->>'amount')::int;
    UPDATE public.profiles SET beans=COALESCE(beans,0)+v_amount WHERE id=v_user;
    RETURN jsonb_build_object('success',true);

  ELSIF _action_type='agency_beans_adjust' THEN
    v_agency:=(_payload->>'agency_id')::uuid; v_delta:=(_payload->>'delta')::bigint;
    UPDATE public.agencies SET beans_balance=COALESCE(beans_balance,0)+v_delta WHERE id=v_agency;
    RETURN jsonb_build_object('success',true);

  ELSIF _action_type='update_gender' THEN
    v_user:=(_payload->>'user_id')::uuid; v_gender:=lower(trim(_payload->>'gender'));
    IF v_gender NOT IN ('female','male') THEN
      RETURN jsonb_build_object('success',false,'error','Invalid gender');
    END IF;
    UPDATE public.profiles SET gender=v_gender,
       is_host = CASE WHEN v_gender='female' AND COALESCE(is_face_verified,false) THEN true ELSE false END,
       host_status = CASE WHEN v_gender='female' AND COALESCE(is_face_verified,false) THEN 'approved'
                          WHEN v_gender='female' THEN 'pending_face' ELSE NULL END,
       updated_at=now() WHERE id=v_user;
    RETURN jsonb_build_object('success',true);

  ELSIF _action_type='process_face_verification' THEN
    v_submission:=(_payload->>'submission_id')::uuid;
    v_action:=lower(trim(coalesce(_payload->>'action','')));
    v_reason:=NULLIF(trim(coalesce(_payload->>'reason','')),'');
    v_approve_as:=lower(trim(coalesce(_payload->>'approve_as','')));
    v_set_gender:=lower(trim(coalesce(_payload->>'set_gender','')));

    SELECT * INTO v_sub FROM public.face_verification_submissions WHERE id=v_submission FOR UPDATE;
    IF NOT FOUND THEN RETURN jsonb_build_object('success',false,'error','Submission not found'); END IF;
    v_user:=v_sub.user_id;

    IF v_action NOT IN ('approve','reject') THEN
      RETURN jsonb_build_object('success',false,'error','Invalid action');
    END IF;

    IF v_action='approve' THEN
      v_approve_as:=CASE WHEN v_approve_as IN ('host','user') THEN v_approve_as ELSE NULL END;
      v_gender:=COALESCE(
        NULLIF(v_set_gender,''),
        CASE WHEN v_approve_as='host' THEN 'female' WHEN v_approve_as='user' THEN 'male' ELSE NULL END,
        CASE WHEN lower(trim(coalesce(v_sub.verification_type,'')))='host' THEN 'female'
             WHEN lower(trim(coalesce(v_sub.verification_type,'')))='user' THEN 'male' ELSE NULL END,
        (SELECT lower(trim(COALESCE(p.gender,''))) FROM public.profiles p WHERE p.id=v_user),
        'male');
      IF v_gender NOT IN ('female','male') THEN v_gender:='male'; END IF;
      v_approve_as:=CASE WHEN v_gender='female' THEN 'host' ELSE 'user' END;
      v_face_url:=COALESCE(v_sub.front_url, v_sub.selfie_url, v_sub.profile_photo_url, v_sub.face_image_url);
      v_avatar_src:=COALESCE(v_sub.profile_photo_url, v_sub.front_url, v_sub.selfie_url);

      UPDATE public.face_verification_submissions
         SET status='approved', verification_type=v_approve_as,
             reviewed_by=v_reviewer, reviewed_at=now(),
             admin_notes=COALESCE(v_reason,admin_notes),
             rejection_reason=NULL, updated_at=now()
       WHERE user_id=v_user
         AND (id=v_submission OR public.face_verification_status_bucket(status)='pending');

      UPDATE public.profiles
         SET is_verified=true, is_face_verified=true, face_verified_at=now(),
             face_verification_status='approved',
             face_verification_image=COALESCE(v_face_url,face_verification_image),
             avatar_url=COALESCE(v_avatar_src,avatar_url),
             gender=v_gender,
             is_host=(v_approve_as='host'),
             host_status=CASE WHEN v_approve_as='host' THEN 'approved' ELSE NULL END,
             updated_at=now()
       WHERE id=v_user;

      RETURN jsonb_build_object('success',true,'gender',v_gender,'verification_type',v_approve_as,'approved_as',v_approve_as);
    ELSE
      UPDATE public.face_verification_submissions
         SET status='rejected',
             reviewed_by=v_reviewer, reviewed_at=now(),
             admin_notes=COALESCE(v_reason,admin_notes),
             rejection_reason=COALESCE(v_reason,rejection_reason,'Rejected by admin'),
             updated_at=now()
       WHERE user_id=v_user
         AND (id=v_submission OR public.face_verification_status_bucket(status)='pending');

      UPDATE public.profiles
         SET is_face_verified=false, face_verification_image=NULL, face_verified_at=NULL,
             face_verification_status='rejected',
             is_host=false,
             host_status='rejected',
             updated_at=now()
       WHERE id=v_user;

      RETURN jsonb_build_object('success',true,'verification_type',lower(trim(coalesce(v_sub.verification_type,'user'))));
    END IF;

  ELSIF _action_type='remove_face_verification' THEN
    v_user:=(_payload->>'user_id')::uuid;
    UPDATE public.face_verification_submissions
       SET status='rejected', reviewed_by=v_reviewer, reviewed_at=now(),
           admin_notes=COALESCE(admin_notes,'')||E'\n[Revoked by admin]', updated_at=now()
     WHERE user_id=v_user AND public.face_verification_status_bucket(status)='approved';
    UPDATE public.profiles
       SET is_face_verified=false,
           face_verification_status='pending_face',
           is_host=false,
           host_status=CASE WHEN is_host THEN 'pending_face' ELSE host_status END,
           updated_at=now()
     WHERE id=v_user;
    RETURN jsonb_build_object('success',true);
  END IF;
  RAISE EXCEPTION 'Unknown action_type: %', _action_type;
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_force_verify_and_approve_host(_user_id uuid, _approve_as text DEFAULT 'host'::text, _set_gender text DEFAULT NULL::text, _reason text DEFAULT NULL::text)
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
BEGIN
  IF NOT public.is_caller_admin() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  _caller_id := COALESCE(auth.uid(), public.current_admin_id_from_header());
  _reviewer_id := public.current_admin_reviewer_auth_id();
  _final_role := CASE WHEN lower(trim(coalesce(_approve_as,''))) = 'user' THEN 'user' ELSE 'host' END;

  SELECT id, gender, avatar_url, face_verification_image
    INTO _existing FROM public.profiles WHERE id = _user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'User profile not found'; END IF;

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

  RETURN jsonb_build_object('success', true, 'user_id', _user_id,
    'approved_as', _final_role, 'gender', _final_gender, 'submission_id', _submission_id);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.current_admin_reviewer_auth_id() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_force_verify_and_approve_host(uuid, text, text, text) TO anon, authenticated;