-- Admin moderation instant move hardening.
-- 1) Pick the most recently reviewed/updated face row per user, so a just-approved
--    or just-rejected row cannot be hidden behind an older media-bearing pending row.
-- 2) Ensure manual admin approve/reject bypasses approval-evidence guards server-side.

-- Admin Face Verification: prefer rows that actually contain uploaded media.
-- Older repair scripts updated orphan rows and made admin DISTINCT ON pick blank rows.
-- This restores photo/video/live-test visibility by choosing the latest media-bearing row per user first.

CREATE OR REPLACE FUNCTION public.admin_face_verification_stats(_search text DEFAULT NULL::text)
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

  WITH latest AS (
    SELECT DISTINCT ON (s.user_id) s.*
    FROM public.face_verification_submissions s
    ORDER BY s.user_id,
      GREATEST(
        coalesce(s.reviewed_at, '-infinity'::timestamptz),
        coalesce(s.updated_at, '-infinity'::timestamptz),
        coalesce(s.created_at, '-infinity'::timestamptz)
      ) DESC NULLS LAST,
      CASE WHEN (
        public.face_verification_has_renderable_media(s.profile_photo_url)
        OR public.face_verification_has_renderable_media(s.video_url)
        OR public.face_verification_has_renderable_media(s.face_image_url)
        OR public.face_verification_has_renderable_media(s.front_url)
        OR public.face_verification_has_renderable_media(s.selfie_url)
        OR EXISTS (
          SELECT 1 FROM unnest(coalesce(s.host_photos, ARRAY[]::text[])) AS hp(url)
          WHERE public.face_verification_has_renderable_media(hp.url)
        )
      ) THEN 1 ELSE 0 END DESC,
      s.created_at DESC NULLS LAST,
      s.id DESC
  ), scoped AS (
    SELECT
      CASE WHEN retry_required THEN 'pending' ELSE public.face_verification_status_bucket(status) END AS status_bucket,
      CASE WHEN retry_required THEN false ELSE public.face_verification_is_auto_reviewed(status, admin_notes, verification_method) END AS is_auto_reviewed,
      CASE WHEN retry_required THEN 'needs_retry' ELSE lower(trim(coalesce(status, ''))) END AS raw_status,
      resolved_role
    FROM (
      SELECT
        s.*,
        public.face_verification_is_retry_required(
          s.status, s.admin_notes, s.ai_analysis,
          s.profile_photo_url, s.video_url, s.face_image_url, s.front_url, s.selfie_url, s.host_photos
        ) AS retry_required,
        CASE
          WHEN lower(trim(coalesce(s.verification_type, ''))) = 'host'
            OR p.is_host IS TRUE
            OR lower(trim(coalesce(p.gender, ''))) = 'female'
          THEN 'host'
          ELSE 'user'
        END AS resolved_role
      FROM latest s
      LEFT JOIN public.profiles p ON p.id = s.user_id
      WHERE v_q IS NULL
         OR p.display_name ILIKE '%' || v_q || '%'
         OR p.app_uid ILIKE '%' || v_q || '%'
         OR s.full_name ILIKE '%' || v_q || '%'
         OR s.user_id::text ILIKE v_q || '%'
    ) x
  )
  SELECT jsonb_build_object(
    'pending', count(*) FILTER (WHERE status_bucket = 'pending'),
    'submitted', count(*) FILTER (WHERE status_bucket = 'pending' AND raw_status = 'submitted'),
    'under_review', count(*) FILTER (WHERE status_bucket = 'pending' AND raw_status = 'under_review'),
    'needs_retry', count(*) FILTER (WHERE status_bucket = 'pending' AND raw_status = 'needs_retry'),
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
    'pending', 0, 'submitted', 0, 'under_review', 0, 'needs_retry', 0,
    'approved', 0, 'rejected', 0,
    'auto_approved', 0, 'auto_rejected', 0,
    'auto_host', 0, 'auto_user', 0, 'auto_face_verification', 0,
    'manual_pending', 0, 'manual_approved', 0, 'manual_rejected', 0,
    'manual_total', 0, 'total', 0
  ));
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_face_verification_stats()
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT public.admin_face_verification_stats(NULL::text);
$function$;

CREATE OR REPLACE FUNCTION public.admin_list_face_verification_paginated(
  _status text DEFAULT NULL::text,
  _search text DEFAULT NULL::text,
  _limit integer DEFAULT 50,
  _offset integer DEFAULT 0
)
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
  IF v_st IN ('all', 'total', '*') THEN v_st := NULL; END IF;

  WITH latest AS (
    SELECT DISTINCT ON (s.user_id) s.*
    FROM public.face_verification_submissions s
    ORDER BY s.user_id,
      GREATEST(
        coalesce(s.reviewed_at, '-infinity'::timestamptz),
        coalesce(s.updated_at, '-infinity'::timestamptz),
        coalesce(s.created_at, '-infinity'::timestamptz)
      ) DESC NULLS LAST,
      CASE WHEN (
        public.face_verification_has_renderable_media(s.profile_photo_url)
        OR public.face_verification_has_renderable_media(s.video_url)
        OR public.face_verification_has_renderable_media(s.face_image_url)
        OR public.face_verification_has_renderable_media(s.front_url)
        OR public.face_verification_has_renderable_media(s.selfie_url)
        OR EXISTS (
          SELECT 1 FROM unnest(coalesce(s.host_photos, ARRAY[]::text[])) AS hp(url)
          WHERE public.face_verification_has_renderable_media(hp.url)
        )
      ) THEN 1 ELSE 0 END DESC,
      s.created_at DESC NULLS LAST,
      s.id DESC
  ), scoped AS (
    SELECT *,
      CASE WHEN retry_required THEN 'pending' ELSE public.face_verification_status_bucket(status) END AS effective_status_bucket,
      CASE WHEN retry_required THEN false ELSE public.face_verification_is_auto_reviewed(status, admin_notes, verification_method) END AS effective_is_auto_reviewed
    FROM (
      SELECT
        s.*,
        p.id AS profile_id,
        p.display_name, p.avatar_url, p.app_uid, p.gender, p.is_host,
        p.is_face_verified, p.is_verified, p.country_code, p.country_flag,
        p.country_name, p.city, p.region, p.registration_ip, p.last_login_ip,
        ag.name AS agency_name, ag.agency_code AS agency_code,
        public.face_verification_is_retry_required(s.status, s.admin_notes, s.ai_analysis, s.profile_photo_url, s.video_url, s.face_image_url, s.front_url, s.selfie_url, s.host_photos) AS retry_required,
        CASE
          WHEN lower(trim(coalesce(s.verification_type, ''))) = 'host'
            OR p.is_host IS TRUE
            OR lower(trim(coalesce(p.gender, ''))) = 'female'
          THEN 'host'
          ELSE 'user'
        END AS resolved_role
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
    ) x
  ), filtered AS (
    SELECT * FROM scoped
    WHERE v_st IS NULL
       OR (v_st IN ('pending','manual_pending','needs_retry','retry_required','upload_failed','upload_incomplete') AND effective_status_bucket = 'pending')
       OR (v_st = 'approved' AND effective_status_bucket = 'approved')
       OR (v_st = 'rejected' AND effective_status_bucket = 'rejected')
       OR (v_st IN ('auto_approved','auto-approved','auto_verified','auto-verified') AND effective_status_bucket = 'approved' AND effective_is_auto_reviewed)
       OR (v_st IN ('auto_rejected','auto-rejected') AND effective_status_bucket = 'rejected' AND effective_is_auto_reviewed)
       OR (v_st IN ('auto_host','auto-host') AND effective_status_bucket = 'approved' AND effective_is_auto_reviewed AND resolved_role = 'host')
       OR (v_st IN ('auto_user','auto-user') AND effective_status_bucket = 'approved' AND effective_is_auto_reviewed AND resolved_role = 'user')
       OR (v_st IN ('manual_approved','manual-approved') AND effective_status_bucket = 'approved' AND NOT effective_is_auto_reviewed)
       OR (v_st IN ('manual_rejected','manual-rejected') AND effective_status_bucket = 'rejected' AND NOT effective_is_auto_reviewed)
       OR (v_st IN ('manual_all','manual-all') AND (effective_status_bucket = 'pending' OR NOT effective_is_auto_reviewed))
  )
  SELECT count(*) INTO v_total FROM filtered;

  WITH latest AS (
    SELECT DISTINCT ON (s.user_id) s.*
    FROM public.face_verification_submissions s
    ORDER BY s.user_id,
      GREATEST(
        coalesce(s.reviewed_at, '-infinity'::timestamptz),
        coalesce(s.updated_at, '-infinity'::timestamptz),
        coalesce(s.created_at, '-infinity'::timestamptz)
      ) DESC NULLS LAST,
      CASE WHEN (
        public.face_verification_has_renderable_media(s.profile_photo_url)
        OR public.face_verification_has_renderable_media(s.video_url)
        OR public.face_verification_has_renderable_media(s.face_image_url)
        OR public.face_verification_has_renderable_media(s.front_url)
        OR public.face_verification_has_renderable_media(s.selfie_url)
        OR EXISTS (
          SELECT 1 FROM unnest(coalesce(s.host_photos, ARRAY[]::text[])) AS hp(url)
          WHERE public.face_verification_has_renderable_media(hp.url)
        )
      ) THEN 1 ELSE 0 END DESC,
      s.created_at DESC NULLS LAST,
      s.id DESC
  ), scoped AS (
    SELECT *,
      CASE WHEN retry_required THEN 'pending' ELSE public.face_verification_status_bucket(status) END AS effective_status_bucket,
      CASE WHEN retry_required THEN false ELSE public.face_verification_is_auto_reviewed(status, admin_notes, verification_method) END AS effective_is_auto_reviewed
    FROM (
      SELECT
        s.*,
        p.id AS profile_id,
        p.display_name, p.avatar_url, p.app_uid, p.gender, p.is_host,
        p.is_face_verified, p.is_verified, p.country_code, p.country_flag,
        p.country_name, p.city, p.region, p.registration_ip, p.last_login_ip,
        ag.name AS agency_name, ag.agency_code AS agency_code,
        public.face_verification_is_retry_required(s.status, s.admin_notes, s.ai_analysis, s.profile_photo_url, s.video_url, s.face_image_url, s.front_url, s.selfie_url, s.host_photos) AS retry_required,
        CASE
          WHEN lower(trim(coalesce(s.verification_type, ''))) = 'host'
            OR p.is_host IS TRUE
            OR lower(trim(coalesce(p.gender, ''))) = 'female'
          THEN 'host'
          ELSE 'user'
        END AS resolved_role
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
    ) x
  ), filtered AS (
    SELECT * FROM scoped
    WHERE v_st IS NULL
       OR (v_st IN ('pending','manual_pending','needs_retry','retry_required','upload_failed','upload_incomplete') AND effective_status_bucket = 'pending')
       OR (v_st = 'approved' AND effective_status_bucket = 'approved')
       OR (v_st = 'rejected' AND effective_status_bucket = 'rejected')
       OR (v_st IN ('auto_approved','auto-approved','auto_verified','auto-verified') AND effective_status_bucket = 'approved' AND effective_is_auto_reviewed)
       OR (v_st IN ('auto_rejected','auto-rejected') AND effective_status_bucket = 'rejected' AND effective_is_auto_reviewed)
       OR (v_st IN ('auto_host','auto-host') AND effective_status_bucket = 'approved' AND effective_is_auto_reviewed AND resolved_role = 'host')
       OR (v_st IN ('auto_user','auto-user') AND effective_status_bucket = 'approved' AND effective_is_auto_reviewed AND resolved_role = 'user')
       OR (v_st IN ('manual_approved','manual-approved') AND effective_status_bucket = 'approved' AND NOT effective_is_auto_reviewed)
       OR (v_st IN ('manual_rejected','manual-rejected') AND effective_status_bucket = 'rejected' AND NOT effective_is_auto_reviewed)
       OR (v_st IN ('manual_all','manual-all') AND (effective_status_bucket = 'pending' OR NOT effective_is_auto_reviewed))
  )
  SELECT coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_rows
  FROM (
    SELECT
      f.id, f.user_id, f.resolved_role AS verification_type,
      CASE WHEN f.retry_required THEN 'needs_retry' ELSE f.status END AS status,
      f.full_name, f.age, f.language, f.profile_photo_url, f.video_url, f.host_photos,
      f.face_image_url, f.selfie_url, f.front_url, f.left_url, f.right_url,
      f.rejection_reason, f.admin_notes, f.ai_analysis,
      f.effective_status_bucket AS status_bucket,
      f.effective_is_auto_reviewed AS is_auto_reviewed,
      CASE WHEN f.effective_is_auto_reviewed THEN 'auto' ELSE 'manual' END AS review_source,
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
    ORDER BY GREATEST(coalesce(f.created_at, '-infinity'::timestamptz), coalesce(f.updated_at, '-infinity'::timestamptz), coalesce(f.reviewed_at, '-infinity'::timestamptz)) DESC NULLS LAST, f.id DESC
    LIMIT GREATEST(_limit, 1)
    OFFSET GREATEST(_offset, 0)
  ) t;

  RETURN jsonb_build_object('rows', v_rows, 'total', coalesce(v_total, 0));
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_face_verification_stats(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_face_verification_stats() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_list_face_verification_paginated(text,text,integer,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_face_verification_stats(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_face_verification_stats() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_list_face_verification_paginated(text,text,integer,integer) TO anon, authenticated, service_role;


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
  v_rev_type text;
  v_rev_id uuid;
  v_admin uuid := public.current_admin_id_from_header();
  v_ok boolean;
  v_role text := public.current_effective_admin_role();
  v_is_service boolean := COALESCE(current_setting('request.jwt.claim.role', true), '') = 'service_role';
  v_old_agency uuid;
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
    UPDATE public.profiles SET diamonds = GREATEST(COALESCE(diamonds,0) + v_amount, 0), updated_at = now() WHERE id = v_user;
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
    IF v_user IS NULL OR v_gender NOT IN ('female','male') THEN
      RETURN jsonb_build_object('success',false,'error','Invalid gender');
    END IF;
    IF public._is_target_user_owner(v_user) THEN
      RETURN jsonb_build_object('success',false,'error','Cannot target an owner account');
    END IF;
    PERFORM set_config('app.bypass_profile_protection','true',true);
    IF v_gender = 'female' THEN
      UPDATE public.profiles
         SET gender             = 'female',
             is_host            = true,
             is_face_verified   = false,
             host_status        = 'pending_face',
             face_verified_at   = NULL,
             updated_at         = now()
       WHERE id = v_user;

      UPDATE public.face_verification_submissions
         SET status      = 'superseded',
             reviewed_at = now(),
             admin_notes = COALESCE(admin_notes,'') ||
               CASE WHEN COALESCE(admin_notes,'') = '' THEN '' ELSE E'\n' END ||
               '[Auto] Superseded by admin gender conversion — re-verification required.'
       WHERE user_id = v_user
         AND status IN ('approved','pending','under_review');
    ELSE
      SELECT agency_id INTO v_old_agency FROM public.profiles WHERE id = v_user;

      UPDATE public.profiles
         SET gender             = 'male',
             is_host            = false,
             host_status        = NULL,
             agency_id          = NULL,
             updated_at         = now()
       WHERE id = v_user;

      IF v_old_agency IS NOT NULL THEN
        UPDATE public.agencies
           SET total_hosts = GREATEST(0, (SELECT COUNT(*) FROM public.profiles p WHERE p.agency_id = v_old_agency AND p.is_host = true)),
               updated_at = now()
         WHERE id = v_old_agency;

        UPDATE public.host_applications
           SET status = 'withdrawn',
               updated_at = now()
         WHERE user_id = v_user
           AND status IN ('pending','under_review','approved');
      END IF;
    END IF;
    PERFORM set_config('app.bypass_profile_protection','false',true);
    RETURN jsonb_build_object('success', true, 'requires_face_verification', v_gender = 'female');

  ELSIF _action_type = 'process_face_verification' THEN
    v_submission := (_payload->>'submission_id')::uuid;
    v_action     := _payload->>'action';
    v_reason     := _payload->>'reason';
    v_set_gender := _payload->>'set_gender';
    v_approve_as := COALESCE(NULLIF(_payload->>'approve_as',''), 'host');
    IF v_submission IS NULL OR v_action NOT IN ('approve','reject') THEN
      RETURN jsonb_build_object('success', false, 'error', 'Invalid face verification action');
    END IF;
    SELECT user_id INTO v_user FROM public.face_verification_submissions WHERE id = v_submission;
    IF v_user IS NULL THEN RETURN jsonb_build_object('success',false,'error','Submission not found'); END IF;

    -- Owner/admin manual decisions must be terminal immediately.
    -- Bypass both profile protection and the evidence/terminal-status trigger so
    -- Admin Pending can move to Approved/Rejected in the same request.
    PERFORM set_config('app.bypass_profile_protection','true',true);
    PERFORM set_config('app.bypass_terminal_status_guard','true',true);
    v_ok := public.auto_finalize_face_verification(
      v_submission, v_action, v_approve_as, v_set_gender, v_reason, NULL::text[]
    );
    PERFORM set_config('app.bypass_terminal_status_guard','false',true);
    PERFORM set_config('app.bypass_profile_protection','false',true);

    IF NOT COALESCE(v_ok,false) THEN
      RETURN jsonb_build_object('success',false,'error','Finalize failed');
    END IF;
    RETURN jsonb_build_object('success',true,'action',v_action);

  ELSIF _action_type = 'remove_face_verification' THEN
    v_user   := (_payload->>'user_id')::uuid;
    v_reason := _payload->>'reason';
    IF v_user IS NULL THEN
      RETURN jsonb_build_object('success',false,'error','Missing user_id');
    END IF;
    -- Owner protection lifted for face-verification removal: face verification
    -- is self-service identity work, not a destructive admin action.

    SELECT agency_id INTO v_old_agency FROM public.profiles WHERE id = v_user;

    PERFORM set_config('app.bypass_profile_protection','true',true);
    UPDATE public.profiles
       SET is_face_verified        = false,
           face_verification_image = NULL,
           face_verified_at        = NULL,
           is_host                 = false,
           host_status             = NULL,
           agency_id               = NULL,
           updated_at              = now()
     WHERE id = v_user;
    PERFORM set_config('app.bypass_profile_protection','false',true);

    UPDATE public.face_verification_submissions
       SET status      = 'superseded',
           reviewed_at = now(),
           admin_notes = COALESCE(admin_notes,'') ||
             CASE WHEN COALESCE(admin_notes,'') = '' THEN '' ELSE E'\n' END ||
             '[Admin] Face verification removed — user can re-submit' || CASE WHEN v_reason IS NULL THEN '' ELSE ' — ' || v_reason END
     WHERE user_id = v_user
       AND status IN ('approved','pending','under_review');

    IF v_old_agency IS NOT NULL THEN
      UPDATE public.agencies
         SET total_hosts = GREATEST(0, (SELECT COUNT(*) FROM public.profiles p WHERE p.agency_id = v_old_agency AND p.is_host = true)),
             updated_at = now()
       WHERE id = v_old_agency;

      UPDATE public.host_applications
         SET status = 'withdrawn',
             updated_at = now()
       WHERE user_id = v_user
         AND status IN ('pending','under_review','approved');
    END IF;

    INSERT INTO public.notifications (user_id, title, message, type, data)
    VALUES (v_user, 'Face verification removed',
            COALESCE(v_reason,
              CASE WHEN v_old_agency IS NOT NULL
                   THEN 'Your face verification was removed by an admin and you have been detached from your agency. You can submit a new face verification at any time.'
                   ELSE 'Your face verification was removed by an admin. You can submit a new face verification at any time.'
              END),
            'face_verification_removed',
            jsonb_build_object('removed_at', now(), 'detached_from_agency', v_old_agency IS NOT NULL, 'previous_agency_id', v_old_agency));

    RETURN jsonb_build_object('success',true, 'detached_from_agency', v_old_agency IS NOT NULL);

  ELSIF _action_type = 'reverse_auto_action' THEN
    v_rev_type := _payload->>'action_type';
    v_rev_id   := (_payload->>'action_id')::uuid;
    v_reason   := _payload->>'reason';
    IF v_rev_type IS NULL OR v_rev_id IS NULL THEN
      RETURN jsonb_build_object('success',false,'error','Missing action_type/action_id');
    END IF;
    RETURN public._do_reverse_auto_action(v_rev_type, v_rev_id, v_reason, v_admin);
  END IF;

  RETURN jsonb_build_object('success', false, 'error', 'No handler');
END;
$function$;