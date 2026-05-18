CREATE OR REPLACE FUNCTION public.face_verification_status_bucket(_status text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN lower(trim(coalesce(_status, ''))) IN ('approved','auto_approved','auto-approved','auto_verified','auto-verified','verified','passed') THEN 'approved'
    WHEN lower(trim(coalesce(_status, ''))) IN ('rejected','auto_rejected','auto-rejected','failed','denied') THEN 'rejected'
    ELSE 'pending'
  END;
$function$;

CREATE OR REPLACE FUNCTION public.face_verification_is_auto_reviewed(_status text, _admin_notes text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN lower(trim(coalesce(_status, ''))) IN ('auto_approved','auto-approved','auto_verified','auto-verified','auto_rejected','auto-rejected') THEN true
    WHEN lower(coalesce(_admin_notes, '')) LIKE '%[auto]%' THEN true
    WHEN lower(coalesce(_admin_notes, '')) LIKE '%auto-approved%' THEN true
    WHEN lower(coalesce(_admin_notes, '')) LIKE '%auto approved%' THEN true
    WHEN lower(coalesce(_admin_notes, '')) LIKE '%service_auto_finalize_face_verification%' THEN true
    WHEN lower(coalesce(_admin_notes, '')) LIKE '%rekognition thresholds passed%' THEN true
    WHEN lower(coalesce(_admin_notes, '')) LIKE '%auto-rejected%' THEN true
    WHEN lower(coalesce(_admin_notes, '')) LIKE '%auto rejected%' THEN true
    WHEN lower(coalesce(_admin_notes, '')) LIKE '%auto-reject%' THEN true
    WHEN lower(coalesce(_admin_notes, '')) LIKE '%auto rejected by ai%' THEN true
    ELSE false
  END;
$function$;

CREATE OR REPLACE FUNCTION public.face_verification_is_auto_reviewed(_status text, _admin_notes text, _verification_method text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $function$
  SELECT public.face_verification_is_auto_reviewed(_status, _admin_notes)
    OR lower(trim(coalesce(_verification_method, ''))) LIKE 'auto%'
    OR lower(trim(coalesce(_verification_method, ''))) IN ('aws','rekognition','aws_rekognition','auto_face','auto_face_verification');
$function$;

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
    UPDATE public.profiles SET coins = COALESCE(coins,0) + v_amount WHERE id = v_user;
    RETURN jsonb_build_object('success',true);

  ELSIF _action_type = 'add_beans' THEN
    v_user := (_payload->>'user_id')::uuid; v_amount := (_payload->>'amount')::int;
    UPDATE public.profiles SET beans = COALESCE(beans,0) + v_amount WHERE id = v_user;
    RETURN jsonb_build_object('success',true);

  ELSIF _action_type = 'agency_beans_adjust' THEN
    v_agency := (_payload->>'agency_id')::uuid; v_delta := (_payload->>'delta')::bigint;
    UPDATE public.agencies SET beans_balance = COALESCE(beans_balance,0) + v_delta WHERE id = v_agency;
    RETURN jsonb_build_object('success',true);

  ELSIF _action_type = 'update_gender' THEN
    v_user := (_payload->>'user_id')::uuid; v_gender := lower(trim(_payload->>'gender'));
    IF v_gender NOT IN ('female','male') THEN RETURN jsonb_build_object('success',false,'error','Invalid gender'); END IF;
    UPDATE public.profiles SET gender = v_gender,
       is_host = CASE WHEN v_gender='female' THEN true ELSE false END,
       host_status = CASE WHEN v_gender='female' AND COALESCE(is_face_verified,false) THEN 'approved'
                          WHEN v_gender='female' THEN 'pending_face' ELSE NULL END,
       updated_at = now() WHERE id = v_user;
    RETURN jsonb_build_object('success',true);

  ELSIF _action_type = 'process_face_verification' THEN
    v_submission := (_payload->>'submission_id')::uuid;
    v_action := lower(trim(coalesce(_payload->>'action','')));
    v_reason := NULLIF(trim(coalesce(_payload->>'reason','')), '');
    v_approve_as := lower(trim(coalesce(_payload->>'approve_as','')));
    v_set_gender := lower(trim(coalesce(_payload->>'set_gender','')));

    SELECT * INTO v_sub FROM public.face_verification_submissions WHERE id = v_submission FOR UPDATE;
    IF NOT FOUND THEN RETURN jsonb_build_object('success',false,'error','Submission not found'); END IF;
    v_user := v_sub.user_id;

    IF v_action NOT IN ('approve','reject') THEN
      RETURN jsonb_build_object('success',false,'error','Invalid action');
    END IF;

    IF v_action = 'approve' THEN
      v_approve_as := CASE WHEN v_approve_as IN ('host','user') THEN v_approve_as ELSE NULL END;
      v_gender := COALESCE(
        NULLIF(v_set_gender,''),
        CASE WHEN v_approve_as = 'host' THEN 'female' WHEN v_approve_as = 'user' THEN 'male' ELSE NULL END,
        CASE WHEN lower(trim(coalesce(v_sub.verification_type,''))) = 'host' THEN 'female' WHEN lower(trim(coalesce(v_sub.verification_type,''))) = 'user' THEN 'male' ELSE NULL END,
        (SELECT lower(trim(COALESCE(p.gender,''))) FROM public.profiles p WHERE p.id = v_user),
        'male'
      );
      IF v_gender NOT IN ('female','male') THEN v_gender := 'male'; END IF;
      v_approve_as := CASE WHEN v_gender='female' THEN 'host' ELSE 'user' END;
      v_face_url := COALESCE(v_sub.front_url, v_sub.selfie_url, v_sub.profile_photo_url, v_sub.face_image_url);
      v_avatar_src := COALESCE(v_sub.profile_photo_url, v_sub.front_url, v_sub.selfie_url);

      UPDATE public.face_verification_submissions
         SET status = 'approved',
             verification_type = v_approve_as,
             reviewed_by = public.current_admin_id_from_header(),
             reviewed_at = now(),
             admin_notes = COALESCE(v_reason, admin_notes),
             rejection_reason = NULL,
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

      RETURN jsonb_build_object('success',true, 'gender', v_gender, 'verification_type', v_approve_as, 'approved_as', v_approve_as);
    ELSE
      UPDATE public.face_verification_submissions
         SET status = 'rejected',
             reviewed_by = public.current_admin_id_from_header(),
             reviewed_at = now(),
             admin_notes = COALESCE(v_reason, admin_notes),
             rejection_reason = COALESCE(v_reason, rejection_reason, 'Rejected by admin'),
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

      RETURN jsonb_build_object('success',true, 'verification_type', lower(trim(coalesce(v_sub.verification_type,'user'))));
    END IF;

  ELSIF _action_type = 'remove_face_verification' THEN
    v_user := (_payload->>'user_id')::uuid;
    UPDATE public.face_verification_submissions
       SET status='rejected', reviewed_by=public.current_admin_id_from_header(), reviewed_at=now(),
           admin_notes = COALESCE(admin_notes,'') || E'\n[Revoked by admin]', updated_at = now()
     WHERE user_id = v_user AND public.face_verification_status_bucket(status) = 'approved';
    UPDATE public.profiles SET is_face_verified=false, face_verification_status='pending_face',
                        host_status = CASE WHEN is_host THEN 'pending_face' ELSE host_status END,
                        updated_at=now() WHERE id = v_user;
    RETURN jsonb_build_object('success',true);
  END IF;
  RAISE EXCEPTION 'Unknown action_type: %', _action_type;
END
$function$;

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
  IF NOT public.is_active_admin_session() THEN RETURN jsonb_build_object('success',false,'error','Not authorized'); END IF;
  SELECT user_id INTO v_user FROM public.face_verification_submissions WHERE id = _submission_id;
  IF v_user IS NULL THEN RETURN jsonb_build_object('success',false,'error','Submission not found'); END IF;
  v_role := public._current_admin_role();
  IF v_role = 'sub_admin' THEN
    v_pending := public._enqueue_admin_pending_action('process_face_verification', v_user, NULL,
      jsonb_build_object('submission_id',_submission_id,'action',_action,'reason',_reason,'approve_as',_approve_as,'set_gender',_set_gender), _reason);
    RETURN jsonb_build_object('pending', true, 'request_id', v_pending);
  END IF;
  RETURN public._execute_admin_pending_action('process_face_verification',
    jsonb_build_object('submission_id',_submission_id,'action',_action,'reason',_reason,'approve_as',_approve_as,'set_gender',_set_gender));
END
$function$;

CREATE OR REPLACE FUNCTION public.admin_force_verify_and_approve_host(_user_id uuid, _approve_as text DEFAULT 'host'::text, _set_gender text DEFAULT NULL::text, _reason text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _caller_id uuid;
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
         reviewed_by = _caller_id, reviewed_at = now(),
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
       _caller_id, now(), COALESCE(_reason, 'Admin direct approval (no submission)'), now(), now())
    RETURNING id INTO _submission_id;
  END IF;

  INSERT INTO public.notifications (user_id, title, message, type, data)
  VALUES (_user_id, '✅ Verification Approved!',
    'Your account has been verified by admin' ||
      CASE WHEN _final_role = 'host' THEN ' and approved as a Host. You can now go live!' ELSE '.' END,
    'face_verification_approved',
    jsonb_build_object('approved_as', _final_role, 'gender', _final_gender, 'forced', true));

  PERFORM public.log_admin_action('force_verify_approve_host', 'profile', _user_id::text,
    jsonb_build_object('approve_as', _final_role, 'gender', _final_gender, 'reason', _reason));

  RETURN jsonb_build_object('success', true, 'user_id', _user_id,
    'approved_as', _final_role, 'gender', _final_gender, 'submission_id', _submission_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_face_verification_stats(_search text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  r jsonb;
  v_q text;
BEGIN
  IF NOT public.is_active_admin_session() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  v_q := NULLIF(trim(coalesce(_search, '')), '');

  WITH scoped AS (
    SELECT
      public.face_verification_status_bucket(s.status) AS status_bucket,
      public.face_verification_is_auto_reviewed(s.status, s.admin_notes, s.verification_method) AS is_auto_reviewed,
      lower(trim(coalesce(s.status, ''))) AS raw_status,
      CASE
        WHEN lower(trim(coalesce(s.verification_type, ''))) = 'host' OR p.is_host IS TRUE OR lower(trim(coalesce(p.gender, ''))) = 'female' THEN 'host'
        ELSE 'user'
      END AS resolved_role
    FROM public.face_verification_submissions s
    LEFT JOIN public.profiles p ON p.id = s.user_id
    WHERE (
      v_q IS NULL
      OR p.display_name ILIKE '%' || v_q || '%'
      OR p.app_uid ILIKE '%' || v_q || '%'
      OR s.full_name ILIKE '%' || v_q || '%'
      OR s.user_id::text ILIKE v_q || '%'
    )
  )
  SELECT jsonb_build_object(
    'pending', count(*) FILTER (WHERE status_bucket = 'pending'),
    'submitted', count(*) FILTER (WHERE raw_status = 'submitted'),
    'under_review', count(*) FILTER (WHERE raw_status = 'under_review'),
    'approved', count(*) FILTER (WHERE status_bucket = 'approved'),
    'rejected', count(*) FILTER (WHERE status_bucket = 'rejected'),
    'auto_approved', count(*) FILTER (WHERE status_bucket = 'approved' AND is_auto_reviewed),
    'auto_rejected', count(*) FILTER (WHERE status_bucket = 'rejected' AND is_auto_reviewed),
    'auto_host', count(*) FILTER (WHERE status_bucket = 'approved' AND is_auto_reviewed AND resolved_role = 'host'),
    'auto_user', count(*) FILTER (WHERE status_bucket = 'approved' AND is_auto_reviewed AND resolved_role = 'user'),
    'auto_face_verification', count(*) FILTER (WHERE is_auto_reviewed),
    'manual_pending', count(*) FILTER (WHERE status_bucket = 'pending'),
    'manual_approved', count(*) FILTER (WHERE status_bucket = 'approved' AND NOT is_auto_reviewed),
    'manual_rejected', count(*) FILTER (WHERE status_bucket = 'rejected' AND NOT is_auto_reviewed),
    'manual_total', count(*) FILTER (WHERE status_bucket = 'pending' OR NOT is_auto_reviewed),
    'total', count(*)
  ) INTO r FROM scoped;

  RETURN coalesce(r, jsonb_build_object(
    'pending', 0,
    'submitted', 0,
    'under_review', 0,
    'approved', 0,
    'rejected', 0,
    'auto_approved', 0,
    'auto_rejected', 0,
    'auto_host', 0,
    'auto_user', 0,
    'auto_face_verification', 0,
    'manual_pending', 0,
    'manual_approved', 0,
    'manual_rejected', 0,
    'manual_total', 0,
    'total', 0
  ));
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_list_face_verification_paginated(_status text DEFAULT NULL::text, _search text DEFAULT NULL::text, _limit integer DEFAULT 50, _offset integer DEFAULT 0)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_total bigint;
  v_rows jsonb;
  v_q text;
  v_st text;
BEGIN
  IF NOT public.is_active_admin_session() THEN
    RAISE EXCEPTION 'Admin session required';
  END IF;

  v_q := NULLIF(trim(coalesce(_search, '')), '');
  v_st := lower(NULLIF(trim(coalesce(_status, '')), ''));
  IF v_st IN ('all', 'total', '*') THEN
    v_st := NULL;
  END IF;

  WITH scoped AS (
    SELECT
      s.*,
      p.id AS profile_id,
      p.display_name,
      p.avatar_url,
      p.app_uid,
      p.gender,
      p.is_host,
      p.is_face_verified,
      p.is_verified,
      p.country_code,
      p.country_flag,
      p.country_name,
      p.city,
      p.region,
      p.registration_ip,
      p.last_login_ip,
      ag.name AS agency_name,
      ag.agency_code AS agency_code,
      public.face_verification_status_bucket(s.status) AS status_bucket,
      public.face_verification_is_auto_reviewed(s.status, s.admin_notes, s.verification_method) AS is_auto_reviewed,
      CASE
        WHEN lower(trim(coalesce(s.verification_type, ''))) = 'host' OR p.is_host IS TRUE OR lower(trim(coalesce(p.gender, ''))) = 'female' THEN 'host'
        ELSE 'user'
      END AS resolved_role
    FROM public.face_verification_submissions s
    LEFT JOIN public.profiles p ON p.id = s.user_id
    LEFT JOIN LATERAL (
      SELECT a.name, a.agency_code
      FROM public.agency_hosts ah
      JOIN public.agencies a ON a.id = ah.agency_id
      WHERE ah.host_id = s.user_id AND ah.status = 'active'
      ORDER BY ah.joined_at DESC NULLS LAST
      LIMIT 1
    ) ag ON true
    WHERE (
      v_q IS NULL
      OR p.display_name ILIKE '%' || v_q || '%'
      OR p.app_uid ILIKE '%' || v_q || '%'
      OR s.full_name ILIKE '%' || v_q || '%'
      OR s.user_id::text ILIKE v_q || '%'
    )
  ), filtered AS (
    SELECT * FROM scoped
    WHERE v_st IS NULL
       OR (v_st IN ('pending','manual_pending') AND status_bucket = 'pending')
       OR (v_st = 'approved' AND status_bucket = 'approved')
       OR (v_st = 'rejected' AND status_bucket = 'rejected')
       OR (v_st IN ('auto_approved','auto-approved','auto_verified','auto-verified') AND status_bucket = 'approved' AND is_auto_reviewed)
       OR (v_st IN ('auto_rejected','auto-rejected') AND status_bucket = 'rejected' AND is_auto_reviewed)
       OR (v_st IN ('auto_host','auto-host') AND status_bucket = 'approved' AND is_auto_reviewed AND resolved_role = 'host')
       OR (v_st IN ('auto_user','auto-user') AND status_bucket = 'approved' AND is_auto_reviewed AND resolved_role = 'user')
       OR (v_st IN ('manual_approved','manual-approved') AND status_bucket = 'approved' AND NOT is_auto_reviewed)
       OR (v_st IN ('manual_rejected','manual-rejected') AND status_bucket = 'rejected' AND NOT is_auto_reviewed)
       OR (v_st IN ('manual_all','manual-all') AND (status_bucket = 'pending' OR NOT is_auto_reviewed))
  )
  SELECT count(*) INTO v_total FROM filtered;

  WITH scoped AS (
    SELECT
      s.*,
      p.id AS profile_id,
      p.display_name,
      p.avatar_url,
      p.app_uid,
      p.gender,
      p.is_host,
      p.is_face_verified,
      p.is_verified,
      p.country_code,
      p.country_flag,
      p.country_name,
      p.city,
      p.region,
      p.registration_ip,
      p.last_login_ip,
      ag.name AS agency_name,
      ag.agency_code AS agency_code,
      public.face_verification_status_bucket(s.status) AS status_bucket,
      public.face_verification_is_auto_reviewed(s.status, s.admin_notes, s.verification_method) AS is_auto_reviewed,
      CASE
        WHEN lower(trim(coalesce(s.verification_type, ''))) = 'host' OR p.is_host IS TRUE OR lower(trim(coalesce(p.gender, ''))) = 'female' THEN 'host'
        ELSE 'user'
      END AS resolved_role
    FROM public.face_verification_submissions s
    LEFT JOIN public.profiles p ON p.id = s.user_id
    LEFT JOIN LATERAL (
      SELECT a.name, a.agency_code
      FROM public.agency_hosts ah
      JOIN public.agencies a ON a.id = ah.agency_id
      WHERE ah.host_id = s.user_id AND ah.status = 'active'
      ORDER BY ah.joined_at DESC NULLS LAST
      LIMIT 1
    ) ag ON true
    WHERE (
      v_q IS NULL
      OR p.display_name ILIKE '%' || v_q || '%'
      OR p.app_uid ILIKE '%' || v_q || '%'
      OR s.full_name ILIKE '%' || v_q || '%'
      OR s.user_id::text ILIKE v_q || '%'
    )
  ), filtered AS (
    SELECT * FROM scoped
    WHERE v_st IS NULL
       OR (v_st IN ('pending','manual_pending') AND status_bucket = 'pending')
       OR (v_st = 'approved' AND status_bucket = 'approved')
       OR (v_st = 'rejected' AND status_bucket = 'rejected')
       OR (v_st IN ('auto_approved','auto-approved','auto_verified','auto-verified') AND status_bucket = 'approved' AND is_auto_reviewed)
       OR (v_st IN ('auto_rejected','auto-rejected') AND status_bucket = 'rejected' AND is_auto_reviewed)
       OR (v_st IN ('auto_host','auto-host') AND status_bucket = 'approved' AND is_auto_reviewed AND resolved_role = 'host')
       OR (v_st IN ('auto_user','auto-user') AND status_bucket = 'approved' AND is_auto_reviewed AND resolved_role = 'user')
       OR (v_st IN ('manual_approved','manual-approved') AND status_bucket = 'approved' AND NOT is_auto_reviewed)
       OR (v_st IN ('manual_rejected','manual-rejected') AND status_bucket = 'rejected' AND NOT is_auto_reviewed)
       OR (v_st IN ('manual_all','manual-all') AND (status_bucket = 'pending' OR NOT is_auto_reviewed))
  )
  SELECT coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_rows
  FROM (
    SELECT
      f.id,
      f.user_id,
      f.resolved_role AS verification_type,
      f.status,
      f.full_name,
      f.age,
      f.language,
      f.profile_photo_url,
      f.video_url,
      f.host_photos,
      f.face_image_url,
      f.selfie_url,
      f.front_url,
      f.left_url,
      f.right_url,
      f.rejection_reason,
      f.admin_notes,
      f.status_bucket,
      f.is_auto_reviewed,
      CASE WHEN f.is_auto_reviewed THEN 'auto' ELSE 'manual' END AS review_source,
      f.created_at,
      f.updated_at,
      f.reviewed_at,
      f.reviewed_by,
      f.is_duplicate_face,
      f.duplicate_face_user_id,
      f.duplicate_face_name,
      f.duplicate_face_uid,
      f.duplicate_face_avatar,
      f.verification_method,
      f.confidence_score,
      f.match_confidence,
      f.rekognition_confidence,
      f.agency_name,
      f.agency_code,
      jsonb_build_object(
        'id', f.profile_id,
        'display_name', f.display_name,
        'avatar_url', f.avatar_url,
        'app_uid', f.app_uid,
        'gender', f.gender,
        'is_host', f.is_host,
        'is_face_verified', f.is_face_verified,
        'is_verified', f.is_verified,
        'country_code', f.country_code,
        'country_flag', f.country_flag,
        'country_name', f.country_name,
        'city', f.city,
        'region', f.region,
        'registration_ip', f.registration_ip,
        'last_login_ip', f.last_login_ip
      ) AS profile
    FROM filtered f
    ORDER BY f.created_at DESC
    LIMIT GREATEST(_limit, 1)
    OFFSET GREATEST(_offset, 0)
  ) t;

  RETURN jsonb_build_object('rows', v_rows, 'total', coalesce(v_total, 0));
END;
$function$;

GRANT EXECUTE ON FUNCTION public.face_verification_status_bucket(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.face_verification_is_auto_reviewed(text,text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.face_verification_is_auto_reviewed(text,text,text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_process_face_verification(uuid,text,text,text,text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_force_verify_and_approve_host(uuid,text,text,text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_face_verification_stats(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_face_verification_paginated(text,text,integer,integer) TO anon, authenticated;