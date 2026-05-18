-- Face verification canonical user-state hardening
-- Fixes ghost Pending rows after approve/reject by making list/stats/action user-canonical.

CREATE OR REPLACE FUNCTION public.face_verification_status_bucket(_status text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN lower(trim(coalesce(_status, ''))) IN ('approved','auto_approved','auto-approved','auto_verified','auto-verified','verified','passed') THEN 'approved'
    WHEN lower(trim(coalesce(_status, ''))) IN ('rejected','auto_rejected','auto-rejected','failed','denied') THEN 'rejected'
    ELSE 'pending'
  END;
$$;

GRANT EXECUTE ON FUNCTION public.face_verification_status_bucket(text) TO public, anon, authenticated, service_role;

-- Repair existing stale submissions from profile truth first.
UPDATE public.face_verification_submissions s
   SET status = 'approved',
       verification_type = CASE
         WHEN coalesce(p.is_host, false) OR lower(trim(coalesce(p.gender, ''))) = 'female' THEN 'host'
         ELSE 'user'
       END,
       reviewed_at = coalesce(s.reviewed_at, now()),
       rejection_reason = NULL,
       updated_at = now()
  FROM public.profiles p
 WHERE p.id = s.user_id
   AND public.face_verification_status_bucket(s.status) = 'pending'
   AND (
     lower(trim(coalesce(p.face_verification_status, ''))) = 'approved'
     OR coalesce(p.is_face_verified, false) = true
     OR lower(trim(coalesce(p.host_status, ''))) = 'approved'
   );

UPDATE public.face_verification_submissions s
   SET status = 'rejected',
       reviewed_at = coalesce(s.reviewed_at, now()),
       rejection_reason = coalesce(s.rejection_reason, 'Rejected by admin'),
       updated_at = now()
  FROM public.profiles p
 WHERE p.id = s.user_id
   AND public.face_verification_status_bucket(s.status) = 'pending'
   AND (
     lower(trim(coalesce(p.face_verification_status, ''))) = 'rejected'
     OR lower(trim(coalesce(p.host_status, ''))) = 'rejected'
   );

-- If one submission for a user is already final, older pending/submitted rows follow the latest final state.
WITH latest_final AS (
  SELECT DISTINCT ON (user_id)
         user_id,
         status,
         verification_type,
         reviewed_at,
         reviewed_by,
         rejection_reason,
         admin_notes
    FROM public.face_verification_submissions
   WHERE public.face_verification_status_bucket(status) IN ('approved', 'rejected')
   ORDER BY user_id, coalesce(reviewed_at, updated_at, created_at) DESC NULLS LAST
)
UPDATE public.face_verification_submissions s
   SET status = lf.status,
       verification_type = coalesce(lf.verification_type, s.verification_type),
       reviewed_at = coalesce(s.reviewed_at, lf.reviewed_at, now()),
       reviewed_by = coalesce(s.reviewed_by, lf.reviewed_by),
       rejection_reason = CASE
         WHEN public.face_verification_status_bucket(lf.status) = 'rejected' THEN coalesce(s.rejection_reason, lf.rejection_reason, 'Rejected by admin')
         ELSE NULL
       END,
       admin_notes = coalesce(s.admin_notes, lf.admin_notes),
       updated_at = now()
  FROM latest_final lf
 WHERE lf.user_id = s.user_id
   AND public.face_verification_status_bucket(s.status) = 'pending';

CREATE OR REPLACE FUNCTION public._execute_admin_pending_action(_action_type text, _payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user uuid; v_amount integer; v_agency uuid; v_delta bigint;
  v_gender text; v_submission uuid; v_action text; v_reason text;
  v_set_gender text; v_approve_as text;
  v_sub public.face_verification_submissions%ROWTYPE;
  v_face_url text; v_avatar_src text;
BEGIN
  PERFORM set_config('app.bypass_profile_protection','true',true);

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
             reviewed_by=public.current_admin_id_from_header(), reviewed_at=now(),
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
             reviewed_by=public.current_admin_id_from_header(), reviewed_at=now(),
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
       SET status='rejected', reviewed_by=public.current_admin_id_from_header(), reviewed_at=now(),
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
$$;

GRANT EXECUTE ON FUNCTION public._execute_admin_pending_action(text, jsonb) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_list_face_verification_paginated(_status text DEFAULT NULL::text, _search text DEFAULT NULL::text, _limit integer DEFAULT 50, _offset integer DEFAULT 0)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
  IF v_st IN ('all', 'total', '*') THEN v_st := NULL; END IF;

  WITH latest AS (
    SELECT DISTINCT ON (s.user_id) s.*
    FROM public.face_verification_submissions s
    ORDER BY s.user_id,
      CASE public.face_verification_status_bucket(s.status)
        WHEN 'approved' THEN 3
        WHEN 'rejected' THEN 2
        ELSE 1
      END DESC,
      coalesce(s.reviewed_at, s.updated_at, s.created_at) DESC NULLS LAST
  ), scoped AS (
    SELECT
      s.*,
      p.id AS profile_id,
      p.display_name, p.avatar_url, p.app_uid, p.gender, p.is_host,
      p.is_face_verified, p.is_verified, p.country_code, p.country_flag,
      p.country_name, p.city, p.region, p.registration_ip, p.last_login_ip,
      ag.name AS agency_name, ag.agency_code AS agency_code,
      CASE
        WHEN lower(trim(coalesce(p.face_verification_status,''))) = 'approved' OR coalesce(p.is_face_verified,false) OR lower(trim(coalesce(p.host_status,''))) = 'approved' THEN 'approved'
        WHEN lower(trim(coalesce(p.face_verification_status,''))) = 'rejected' OR lower(trim(coalesce(p.host_status,''))) = 'rejected' THEN 'rejected'
        ELSE public.face_verification_status_bucket(s.status)
      END AS status_bucket,
      public.face_verification_is_auto_reviewed(s.status, s.admin_notes, s.verification_method) AS is_auto_reviewed,
      CASE WHEN lower(trim(coalesce(s.verification_type, ''))) = 'host' OR p.is_host IS TRUE OR lower(trim(coalesce(p.gender, ''))) = 'female' THEN 'host' ELSE 'user' END AS resolved_role
    FROM latest s
    LEFT JOIN public.profiles p ON p.id = s.user_id
    LEFT JOIN LATERAL (
      SELECT a.name, a.agency_code
      FROM public.agency_hosts ah
      JOIN public.agencies a ON a.id = ah.agency_id
      WHERE ah.host_id = s.user_id AND ah.status = 'active'
      ORDER BY ah.joined_at DESC NULLS LAST
      LIMIT 1
    ) ag ON true
    WHERE v_q IS NULL
       OR p.display_name ILIKE '%' || v_q || '%'
       OR p.app_uid ILIKE '%' || v_q || '%'
       OR s.full_name ILIKE '%' || v_q || '%'
       OR s.user_id::text ILIKE v_q || '%'
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

  WITH latest AS (
    SELECT DISTINCT ON (s.user_id) s.*
    FROM public.face_verification_submissions s
    ORDER BY s.user_id,
      CASE public.face_verification_status_bucket(s.status)
        WHEN 'approved' THEN 3
        WHEN 'rejected' THEN 2
        ELSE 1
      END DESC,
      coalesce(s.reviewed_at, s.updated_at, s.created_at) DESC NULLS LAST
  ), scoped AS (
    SELECT
      s.*,
      p.id AS profile_id,
      p.display_name, p.avatar_url, p.app_uid, p.gender, p.is_host,
      p.is_face_verified, p.is_verified, p.country_code, p.country_flag,
      p.country_name, p.city, p.region, p.registration_ip, p.last_login_ip,
      ag.name AS agency_name, ag.agency_code AS agency_code,
      CASE
        WHEN lower(trim(coalesce(p.face_verification_status,''))) = 'approved' OR coalesce(p.is_face_verified,false) OR lower(trim(coalesce(p.host_status,''))) = 'approved' THEN 'approved'
        WHEN lower(trim(coalesce(p.face_verification_status,''))) = 'rejected' OR lower(trim(coalesce(p.host_status,''))) = 'rejected' THEN 'rejected'
        ELSE public.face_verification_status_bucket(s.status)
      END AS status_bucket,
      public.face_verification_is_auto_reviewed(s.status, s.admin_notes, s.verification_method) AS is_auto_reviewed,
      CASE WHEN lower(trim(coalesce(s.verification_type, ''))) = 'host' OR p.is_host IS TRUE OR lower(trim(coalesce(p.gender, ''))) = 'female' THEN 'host' ELSE 'user' END AS resolved_role
    FROM latest s
    LEFT JOIN public.profiles p ON p.id = s.user_id
    LEFT JOIN LATERAL (
      SELECT a.name, a.agency_code
      FROM public.agency_hosts ah
      JOIN public.agencies a ON a.id = ah.agency_id
      WHERE ah.host_id = s.user_id AND ah.status = 'active'
      ORDER BY ah.joined_at DESC NULLS LAST
      LIMIT 1
    ) ag ON true
    WHERE v_q IS NULL
       OR p.display_name ILIKE '%' || v_q || '%'
       OR p.app_uid ILIKE '%' || v_q || '%'
       OR s.full_name ILIKE '%' || v_q || '%'
       OR s.user_id::text ILIKE v_q || '%'
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
      f.id, f.user_id, f.resolved_role AS verification_type, f.status, f.full_name,
      f.age, f.language, f.profile_photo_url, f.video_url, f.host_photos,
      f.face_image_url, f.selfie_url, f.front_url, f.left_url, f.right_url,
      f.rejection_reason, f.admin_notes, f.status_bucket, f.is_auto_reviewed,
      CASE WHEN f.is_auto_reviewed THEN 'auto' ELSE 'manual' END AS review_source,
      f.created_at, f.updated_at, f.reviewed_at, f.reviewed_by,
      f.is_duplicate_face, f.duplicate_face_user_id, f.duplicate_face_name,
      f.duplicate_face_uid, f.duplicate_face_avatar, f.verification_method,
      f.confidence_score, f.match_confidence, f.rekognition_confidence,
      f.agency_name, f.agency_code,
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
$$;

GRANT EXECUTE ON FUNCTION public.admin_list_face_verification_paginated(text, text, integer, integer) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_face_verification_stats(_search text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  r jsonb;
  v_q text;
BEGIN
  IF NOT public.is_active_admin_session() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  v_q := NULLIF(trim(coalesce(_search, '')), '');

  WITH latest AS (
    SELECT DISTINCT ON (s.user_id) s.*
    FROM public.face_verification_submissions s
    ORDER BY s.user_id,
      CASE public.face_verification_status_bucket(s.status)
        WHEN 'approved' THEN 3
        WHEN 'rejected' THEN 2
        ELSE 1
      END DESC,
      coalesce(s.reviewed_at, s.updated_at, s.created_at) DESC NULLS LAST
  ), scoped AS (
    SELECT
      CASE
        WHEN lower(trim(coalesce(p.face_verification_status,''))) = 'approved' OR coalesce(p.is_face_verified,false) OR lower(trim(coalesce(p.host_status,''))) = 'approved' THEN 'approved'
        WHEN lower(trim(coalesce(p.face_verification_status,''))) = 'rejected' OR lower(trim(coalesce(p.host_status,''))) = 'rejected' THEN 'rejected'
        ELSE public.face_verification_status_bucket(s.status)
      END AS status_bucket,
      public.face_verification_is_auto_reviewed(s.status, s.admin_notes, s.verification_method) AS is_auto_reviewed,
      lower(trim(coalesce(s.status, ''))) AS raw_status,
      CASE WHEN lower(trim(coalesce(s.verification_type, ''))) = 'host' OR p.is_host IS TRUE OR lower(trim(coalesce(p.gender, ''))) = 'female' THEN 'host' ELSE 'user' END AS resolved_role
    FROM latest s
    LEFT JOIN public.profiles p ON p.id = s.user_id
    WHERE v_q IS NULL
       OR p.display_name ILIKE '%' || v_q || '%'
       OR p.app_uid ILIKE '%' || v_q || '%'
       OR s.full_name ILIKE '%' || v_q || '%'
       OR s.user_id::text ILIKE v_q || '%'
  )
  SELECT jsonb_build_object(
    'pending', count(*) FILTER (WHERE status_bucket = 'pending'),
    'submitted', count(*) FILTER (WHERE status_bucket = 'pending' AND raw_status = 'submitted'),
    'under_review', count(*) FILTER (WHERE status_bucket = 'pending' AND raw_status = 'under_review'),
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
    'pending', 0, 'submitted', 0, 'under_review', 0,
    'approved', 0, 'rejected', 0,
    'auto_approved', 0, 'auto_rejected', 0,
    'auto_host', 0, 'auto_user', 0, 'auto_face_verification', 0,
    'manual_pending', 0, 'manual_approved', 0, 'manual_rejected', 0,
    'manual_total', 0, 'total', 0
  ));
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_face_verification_stats()
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT public.admin_face_verification_stats(NULL::text);
$$;

GRANT EXECUTE ON FUNCTION public.admin_face_verification_stats(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_face_verification_stats() TO anon, authenticated, service_role;