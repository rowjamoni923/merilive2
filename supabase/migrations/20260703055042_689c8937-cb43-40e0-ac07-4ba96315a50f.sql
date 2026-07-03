CREATE OR REPLACE FUNCTION public.profile_public_media_url(_src text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v text;
  v_key text;
  v_base text := 'https://ayjdlvuurscxucatbbah.supabase.co/functions/v1/public-profile-avatar/';
BEGIN
  v := nullif(trim(coalesce(_src, '')), '');
  IF v IS NULL THEN
    RETURN NULL;
  END IF;

  -- Already proxied for public profile rendering.
  IF lower(v) LIKE '%/functions/v1/public-profile-avatar/%' THEN
    RETURN v;
  END IF;

  -- Canonical private bucket/path stored by the current upload flow.
  IF lower(v) LIKE 'face-verification/%' THEN
    v_key := regexp_replace(v, '^face-verification/+', '', 'i');
    RETURN v_base || v_key;
  END IF;

  -- Historical public/signed/authenticated Storage URLs for the private face bucket.
  v_key := substring(v from '/storage/v1/(?:object|render/image)/(?:public|sign|authenticated)/face-verification/([^?#]+)');
  IF v_key IS NOT NULL AND length(v_key) > 0 THEN
    RETURN v_base || v_key;
  END IF;

  RETURN v;
END;
$$;

GRANT EXECUTE ON FUNCTION public.profile_public_media_url(text) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.auto_finalize_face_verification(
  _submission_id uuid,
  _action text,
  _approve_as text DEFAULT 'user'::text,
  _set_gender text DEFAULT NULL::text,
  _reason text DEFAULT NULL::text,
  _tags text[] DEFAULT NULL::text[]
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _submission RECORD;
  _gender_value text;
  _face_url text;
  _avatar_src text;
  _public_avatar_src text;
  _host_photos text[];
  _public_host_photos text[];
  _admin_id uuid;
BEGIN
  SELECT * INTO _submission FROM public.face_verification_submissions WHERE id = _submission_id;
  IF NOT FOUND THEN RETURN FALSE; END IF;

  _admin_id := public.current_admin_id_from_header();
  _gender_value := COALESCE(NULLIF(_set_gender, ''), CASE WHEN _approve_as = 'host' THEN 'female' ELSE 'male' END);
  _face_url := COALESCE(_submission.face_image_url, _submission.front_url, _submission.selfie_url, _submission.profile_photo_url);
  _avatar_src := COALESCE(_submission.profile_photo_url, _submission.front_url, _submission.selfie_url, _submission.face_image_url);
  _public_avatar_src := public.profile_public_media_url(_avatar_src);

  IF _submission.host_photos IS NOT NULL THEN
    SELECT array_agg(u) INTO _host_photos
    FROM (SELECT unnest(_submission.host_photos) AS u) s
    WHERE u IS NOT NULL AND length(trim(u)) > 0;

    SELECT array_agg(public.profile_public_media_url(u)) INTO _public_host_photos
    FROM (SELECT unnest(_submission.host_photos) AS u) s
    WHERE u IS NOT NULL AND length(trim(u)) > 0;
  END IF;

  PERFORM set_config('app.bypass_terminal_status_guard','true',true);
  PERFORM set_config('app.bypass_profile_protection','true',true);

  IF lower(trim(coalesce(_action, ''))) = 'approve' THEN
    UPDATE public.face_verification_submissions
       SET status = 'approved',
           verification_type = _approve_as,
           reviewed_by = COALESCE(_admin_id, reviewed_by),
           reviewed_at = now(),
           verification_method = CASE WHEN _admin_id IS NOT NULL THEN 'manual' ELSE COALESCE(verification_method, 'manual') END,
           admin_notes = COALESCE(_reason, admin_notes),
           rejection_reason = NULL,
           updated_at = now()
     WHERE id = _submission_id;

    UPDATE public.profiles
       SET is_verified              = true,
           is_face_verified         = true,
           face_verification_image  = COALESCE(_face_url, face_verification_image),
           face_verification_status = 'approved',
           face_verified_at         = now(),
           avatar_url               = COALESCE(_public_avatar_src, _avatar_src, avatar_url),
           profile_photo_url        = COALESCE(_public_avatar_src, _avatar_src, profile_photo_url),
           host_photos              = CASE WHEN _public_host_photos IS NOT NULL AND array_length(_public_host_photos, 1) > 0 THEN _public_host_photos ELSE host_photos END,
           is_host                  = (_approve_as = 'host'),
           host_status              = CASE WHEN _approve_as = 'host' THEN 'approved' ELSE NULL END,
           gender                   = _gender_value,
           updated_at               = now()
     WHERE id = _submission.user_id;

  ELSIF lower(trim(coalesce(_action, ''))) = 'reject' THEN
    UPDATE public.face_verification_submissions
       SET status = 'rejected',
           reviewed_by = COALESCE(_admin_id, reviewed_by),
           reviewed_at = now(),
           verification_method = CASE WHEN _admin_id IS NOT NULL THEN 'manual' ELSE verification_method END,
           rejection_reason = COALESCE(_reason, rejection_reason),
           updated_at = now()
     WHERE id = _submission_id;

    UPDATE public.profiles
       SET is_face_verified         = false,
           face_verification_image  = NULL,
           face_verification_status = 'rejected',
           face_verified_at         = NULL,
           updated_at               = now()
     WHERE id = _submission.user_id;

  ELSIF lower(trim(coalesce(_action, ''))) = 'under_review' THEN
    UPDATE public.face_verification_submissions
       SET status = 'under_review',
           admin_notes = COALESCE(_reason, admin_notes),
           updated_at = now()
     WHERE id = _submission_id;

    UPDATE public.profiles
       SET face_verification_status = 'under_review',
           updated_at               = now()
     WHERE id = _submission.user_id;
  ELSE
    PERFORM set_config('app.bypass_terminal_status_guard','false',true);
    PERFORM set_config('app.bypass_profile_protection','false',true);
    RETURN FALSE;
  END IF;

  PERFORM set_config('app.bypass_terminal_status_guard','false',true);
  PERFORM set_config('app.bypass_profile_protection','false',true);
  RETURN TRUE;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.auto_finalize_face_verification(uuid,text,text,text,text,text[]) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.tg_sync_profile_on_face_verification_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_face_url text;
  v_avatar_src text;
  v_public_avatar_src text;
  v_host_photos text[];
  v_public_host_photos text[];
  v_resolved_role text;
BEGIN
  IF TG_OP = 'INSERT' OR NEW.status IS DISTINCT FROM OLD.status OR NEW.profile_photo_url IS DISTINCT FROM OLD.profile_photo_url OR NEW.front_url IS DISTINCT FROM OLD.front_url OR NEW.face_image_url IS DISTINCT FROM OLD.face_image_url THEN
    PERFORM set_config('app.bypass_profile_protection', 'true', true);

    v_face_url := COALESCE(NEW.face_image_url, NEW.front_url, NEW.selfie_url, NEW.profile_photo_url);
    v_avatar_src := COALESCE(NEW.profile_photo_url, NEW.front_url, NEW.selfie_url, NEW.face_image_url);
    v_public_avatar_src := public.profile_public_media_url(v_avatar_src);
    v_resolved_role := CASE WHEN lower(trim(coalesce(NEW.verification_type, ''))) = 'host' THEN 'host' ELSE 'user' END;

    IF NEW.host_photos IS NOT NULL THEN
      SELECT array_agg(u) INTO v_host_photos
      FROM (SELECT unnest(NEW.host_photos) AS u) s
      WHERE u IS NOT NULL AND length(trim(u)) > 0;

      SELECT array_agg(public.profile_public_media_url(u)) INTO v_public_host_photos
      FROM (SELECT unnest(NEW.host_photos) AS u) s
      WHERE u IS NOT NULL AND length(trim(u)) > 0;
    END IF;

    IF public.face_verification_status_bucket(NEW.status) = 'approved' THEN
      UPDATE public.profiles
      SET is_verified = true,
          is_face_verified = true,
          face_verification_status = 'approved',
          face_verification_image = COALESCE(v_face_url, face_verification_image),
          avatar_url = COALESCE(v_public_avatar_src, v_avatar_src, avatar_url),
          profile_photo_url = COALESCE(v_public_avatar_src, v_avatar_src, profile_photo_url),
          host_photos = CASE WHEN v_public_host_photos IS NOT NULL AND array_length(v_public_host_photos, 1) > 0 THEN v_public_host_photos ELSE host_photos END,
          is_host = CASE WHEN v_resolved_role = 'host' THEN true ELSE is_host END,
          host_status = CASE WHEN v_resolved_role = 'host' THEN 'approved' ELSE host_status END,
          face_verified_at = coalesce(face_verified_at, now()),
          updated_at = now()
      WHERE id = NEW.user_id;
    ELSIF public.face_verification_status_bucket(NEW.status) = 'rejected' THEN
      UPDATE public.profiles
      SET is_face_verified = false,
          face_verification_status = 'rejected',
          updated_at = now()
      WHERE id = NEW.user_id;
    ELSIF lower(trim(coalesce(NEW.status, ''))) IN ('needs_retry','retry_required','upload_failed','upload_incomplete') THEN
      UPDATE public.profiles
      SET is_face_verified = false,
          face_verification_status = 'needs_retry',
          updated_at = now()
      WHERE id = NEW.user_id
        AND coalesce(is_face_verified, false) = false;
    ELSIF public.face_verification_status_bucket(NEW.status) = 'pending' THEN
      UPDATE public.profiles
      SET is_face_verified = false,
          face_verification_status = 'under_review',
          updated_at = now()
      WHERE id = NEW.user_id
        AND coalesce(is_face_verified, false) = false;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

GRANT EXECUTE ON FUNCTION public.tg_sync_profile_on_face_verification_status() TO service_role;

CREATE OR REPLACE FUNCTION public._service_auto_finalize_face_verification_impl(p_submission_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_sub public.face_verification_submissions%ROWTYPE;
  v_auto jsonb;
  v_manual_flag boolean;
  v_gender_conf numeric;
  v_fl numeric; v_fr numeric;
  v_face_conf numeric;
  v_age_high int;
  v_occ numeric;
  v_final text;
  v_enabled text;
  v_face_url text; v_avatar_src text; v_public_avatar_src text;
  v_vt text;
  v_face_count int; v_left_count int; v_right_count int;
  v_front_err text; v_left_err text; v_right_err text;
  v_front_yaw numeric; v_left_yaw numeric; v_right_yaw numeric;
  v_left_delta numeric; v_right_delta numeric; v_lr_delta numeric;
  v_profile_gender text; v_profile_is_host boolean;
  v_expected_gender text;
  v_replay_suspected boolean; v_liveness_failed boolean;
  v_profile_mismatch boolean; v_duplicate_face boolean;
  v_passive_scan boolean;
  v_evidence_complete boolean; v_evidence_same_person boolean;
  v_identity_mismatch boolean;
  v_host_photos text[];
  v_public_host_photos text[];
  v_full_name text; v_language text; v_age int;
  v_photo_live numeric; v_face_video_live numeric;
  v_strong_identity boolean; v_super_strong boolean;
  v_profile_match numeric; v_host_min numeric;
  v_t_same numeric; v_t_strong numeric; v_t_super numeric;
  v_t_gender_conf numeric; v_t_face_conf numeric; v_t_occ numeric;
BEGIN
  SELECT setting_value::text INTO v_enabled FROM public.app_settings WHERE setting_key='face_verification_auto_approve_enabled' LIMIT 1;
  IF lower(trim(both '"' from trim(coalesce(v_enabled, '')))) NOT IN ('1','true','t','yes') THEN
    RETURN jsonb_build_object('success', false, 'reason', 'auto_disabled');
  END IF;

  SELECT coalesce(nullif(trim(both '"' from setting_value), '')::numeric, 55) INTO v_t_same FROM public.app_settings WHERE setting_key='face_verification_same_person_min_similarity' LIMIT 1;
  v_t_same := coalesce(v_t_same, 55);
  SELECT coalesce(nullif(trim(both '"' from setting_value), '')::numeric, 75) INTO v_t_strong FROM public.app_settings WHERE setting_key='face_verification_strong_identity_min' LIMIT 1;
  v_t_strong := coalesce(v_t_strong, 75);
  SELECT coalesce(nullif(trim(both '"' from setting_value), '')::numeric, 85) INTO v_t_super FROM public.app_settings WHERE setting_key='face_verification_super_strong_min' LIMIT 1;
  v_t_super := coalesce(v_t_super, 85);
  SELECT coalesce(nullif(trim(both '"' from setting_value), '')::numeric, 50) INTO v_t_gender_conf FROM public.app_settings WHERE setting_key='face_verification_gender_confidence_min' LIMIT 1;
  v_t_gender_conf := coalesce(v_t_gender_conf, 50);
  SELECT coalesce(nullif(trim(both '"' from setting_value), '')::numeric, 45) INTO v_t_face_conf FROM public.app_settings WHERE setting_key='face_verification_face_confidence_min' LIMIT 1;
  v_t_face_conf := coalesce(v_t_face_conf, 45);
  SELECT coalesce(nullif(trim(both '"' from setting_value), '')::numeric, 98) INTO v_t_occ FROM public.app_settings WHERE setting_key='face_verification_occlusion_block_threshold' LIMIT 1;
  v_t_occ := coalesce(v_t_occ, 98);

  SELECT * INTO v_sub FROM public.face_verification_submissions WHERE id = p_submission_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'submission_not_found');
  END IF;

  IF public.face_verification_status_bucket(v_sub.status) IS DISTINCT FROM 'pending'
     AND lower(coalesce(v_sub.status,'')) NOT IN ('needs_retry','under_review') THEN
    RETURN jsonb_build_object('success', false, 'reason', 'wrong_status', 'status', v_sub.status);
  END IF;

  SELECT lower(trim(coalesce(gender, ''))), coalesce(is_host, false) INTO v_profile_gender, v_profile_is_host FROM public.profiles WHERE id = v_sub.user_id;
  v_expected_gender := CASE
    WHEN lower(trim(coalesce(v_sub.verification_type, ''))) = 'host' THEN 'female'
    WHEN lower(trim(coalesce(v_sub.verification_type, ''))) IN ('user', 'face') THEN 'male'
    WHEN v_profile_gender IN ('male', 'female') THEN v_profile_gender
    WHEN v_profile_is_host THEN 'female'
    ELSE 'male' END;

  v_auto := coalesce(v_sub.ai_analysis, '{}'::jsonb) -> 'rekognition';
  v_passive_scan := coalesce(v_sub.ai_analysis ->> 'scan_mode', '') = 'passive_photo_video_live';

  IF v_auto IS NULL OR v_auto = 'null'::jsonb THEN
    RETURN jsonb_build_object('success', false, 'reason', 'no_rekognition_block');
  END IF;

  v_manual_flag := lower(trim(coalesce(v_sub.ai_analysis ->> 'manual_review_required', 'false'))) IN ('1','true','t','yes');
  IF v_manual_flag THEN
    RETURN jsonb_build_object('success', false, 'reason', 'client_manual_review_required', 'manual_review_requested', true);
  END IF;

  v_replay_suspected := lower(trim(coalesce(v_auto ->> 'replay_suspected', 'false'))) IN ('1','true','t','yes');
  v_liveness_failed := lower(trim(coalesce(v_auto ->> 'liveness_failed', 'false'))) IN ('1','true','t','yes');
  v_profile_mismatch := lower(trim(coalesce(v_auto ->> 'profile_mismatch', 'false'))) IN ('1','true','t','yes');
  v_duplicate_face := coalesce(v_sub.is_duplicate_face, false) OR coalesce(v_sub.ai_analysis ? 'duplicate_account', false);
  v_evidence_complete := lower(trim(coalesce(v_auto ->> 'evidence_complete', 'false'))) IN ('1','true','t','yes');
  v_evidence_same_person := lower(trim(coalesce(v_auto ->> 'evidence_same_person', 'false'))) IN ('1','true','t','yes');
  v_identity_mismatch := lower(trim(coalesce(v_auto ->> 'identity_mismatch', 'false'))) IN ('1','true','t','yes');

  v_photo_live := coalesce(nullif(v_auto ->> 'photo_live_score', '')::numeric, 0);
  v_face_video_live := coalesce(nullif(v_auto ->> 'face_video_live_score', '')::numeric, 0);
  v_profile_match := coalesce(nullif(v_auto ->> 'profile_match_score', '')::numeric, 0);
  v_host_min := coalesce(nullif(v_auto ->> 'host_photos_min_score', '')::numeric, 0);

  v_strong_identity := v_passive_scan AND v_evidence_complete AND v_evidence_same_person AND NOT v_identity_mismatch
    AND (v_photo_live >= v_t_strong OR v_face_video_live >= v_t_strong OR v_profile_match >= v_t_strong OR v_host_min >= v_t_strong);

  v_super_strong := v_passive_scan AND v_photo_live >= v_t_super AND v_face_video_live >= v_t_super AND coalesce(v_profile_match, 0) >= v_t_same;

  IF v_duplicate_face THEN
    RETURN jsonb_build_object('success', false, 'reason', 'duplicate_face', 'manual_review_requested', true);
  END IF;
  IF v_replay_suspected AND NOT v_super_strong THEN
    RETURN jsonb_build_object('success', false, 'reason', 'replay_suspected', 'manual_review_requested', true);
  END IF;
  IF v_liveness_failed AND NOT v_strong_identity AND NOT v_super_strong THEN
    RETURN jsonb_build_object('success', false, 'reason', 'liveness_failed', 'manual_review_requested', true);
  END IF;
  IF v_profile_mismatch AND NOT v_strong_identity AND NOT v_super_strong THEN
    RETURN jsonb_build_object('success', false, 'reason', 'profile_face_mismatch', 'manual_review_requested', true);
  END IF;
  IF v_passive_scan AND (NOT v_evidence_complete OR NOT v_evidence_same_person OR v_identity_mismatch) THEN
    IF NOT v_super_strong THEN
      RETURN jsonb_build_object('success', false,
        'reason', CASE WHEN v_identity_mismatch THEN 'photo_video_live_identity_mismatch' ELSE 'photo_video_live_evidence_missing' END,
        'manual_review_requested', true);
    END IF;
  END IF;

  v_face_count := CASE WHEN coalesce(v_auto ->> 'face_count', '') ~ '^-?\d+$' THEN (v_auto ->> 'face_count')::int ELSE -1 END;
  v_left_count := CASE WHEN coalesce(v_auto ->> 'left_face_count', '') ~ '^-?\d+$' THEN (v_auto ->> 'left_face_count')::int ELSE -1 END;
  v_right_count := CASE WHEN coalesce(v_auto ->> 'right_face_count', '') ~ '^-?\d+$' THEN (v_auto ->> 'right_face_count')::int ELSE -1 END;

  IF v_face_count < 1 THEN
    RETURN jsonb_build_object('success', false, 'reason', 'no_face_in_front', 'face_count', v_face_count, 'manual_review_requested', true);
  END IF;
  IF NOT v_passive_scan AND (v_left_count < 1 OR v_right_count < 1) THEN
    RETURN jsonb_build_object('success', false, 'reason', 'no_face_in_side', 'manual_review_requested', true);
  END IF;

  v_front_err := trim(coalesce(v_auto ->> 'front_error', ''));
  v_left_err := trim(coalesce(v_auto ->> 'left_error', ''));
  v_right_err := trim(coalesce(v_auto ->> 'right_error', ''));
  IF v_front_err = 'no_face_front' OR (NOT v_passive_scan AND (v_left_err = 'no_face_left' OR v_right_err = 'no_face_right')) THEN
    RETURN jsonb_build_object('success', false, 'reason', 'angle_error', 'front_error', nullif(v_front_err,''), 'manual_review_requested', true);
  END IF;

  v_gender_conf := coalesce(nullif(v_auto ->> 'gender_confidence', '')::numeric, 0);
  v_fl := coalesce(nullif(v_auto ->> 'compare_front_left', '')::numeric, 0);
  v_fr := coalesce(nullif(v_auto ->> 'compare_front_right', '')::numeric, 0);
  v_face_conf := coalesce(nullif(v_auto ->> 'face_confidence', '')::numeric, 0);
  v_age_high := coalesce(nullif(v_auto ->> 'age_range_high', '')::int, 99);
  v_occ := coalesce(nullif(v_auto ->> 'face_occluded_confidence', '')::numeric, 0);
  v_final := lower(trim(coalesce(v_auto ->> 'final_gender', '')));
  v_front_yaw := nullif(v_auto ->> 'front_pose_yaw', '')::numeric;
  v_left_yaw := nullif(v_auto ->> 'left_pose_yaw', '')::numeric;
  v_right_yaw := nullif(v_auto ->> 'right_pose_yaw', '')::numeric;

  IF v_final NOT IN ('male', 'female') THEN
    IF NOT v_strong_identity AND NOT v_super_strong THEN
      RETURN jsonb_build_object('success', false, 'reason', 'invalid_final_gender', 'manual_review_requested', true);
    END IF;
  ELSIF v_expected_gender IN ('male', 'female') AND v_final <> v_expected_gender THEN
    RETURN jsonb_build_object('success', false, 'reason', 'account_gender_mismatch', 'expected_gender', v_expected_gender, 'detected_gender', v_final, 'manual_review_requested', true);
  END IF;

  IF NOT v_strong_identity AND NOT v_super_strong THEN
    IF v_gender_conf < v_t_gender_conf OR v_face_conf < v_t_face_conf THEN
      RETURN jsonb_build_object('success', false, 'reason', 'below_thresholds', 'manual_review_requested', true);
    END IF;
  END IF;

  IF NOT v_passive_scan AND (v_fl < v_t_same OR v_fr < v_t_same) THEN
    RETURN jsonb_build_object('success', false, 'reason', 'low_similarity', 'manual_review_requested', true);
  END IF;
  IF NOT v_passive_scan AND v_front_yaw IS NOT NULL AND v_left_yaw IS NOT NULL AND v_right_yaw IS NOT NULL THEN
    v_left_delta := abs(v_left_yaw - v_front_yaw);
    v_right_delta := abs(v_right_yaw - v_front_yaw);
    v_lr_delta := abs(v_left_yaw - v_right_yaw);
    IF v_left_delta < 8 AND v_right_delta < 8 THEN
      RETURN jsonb_build_object('success', false, 'reason', 'insufficient_side_pose', 'manual_review_requested', true);
    END IF;
    IF v_lr_delta < 12 THEN
      RETURN jsonb_build_object('success', false, 'reason', 'insufficient_left_right_pose_gap', 'manual_review_requested', true);
    END IF;
  END IF;
  IF v_age_high < 18 THEN
    RETURN jsonb_build_object('success', false, 'reason', 'underage', 'manual_review_requested', true);
  END IF;
  IF v_occ > v_t_occ AND NOT v_strong_identity AND NOT v_super_strong THEN
    RETURN jsonb_build_object('success', false, 'reason', 'face_occluded', 'manual_review_requested', true);
  END IF;

  v_face_url := coalesce(v_sub.face_image_url, v_sub.front_url, v_sub.selfie_url, v_sub.profile_photo_url);
  v_avatar_src := coalesce(v_sub.profile_photo_url, v_sub.front_url, v_sub.selfie_url, v_sub.face_image_url);
  v_public_avatar_src := public.profile_public_media_url(v_avatar_src);
  v_vt := CASE WHEN v_expected_gender = 'female' THEN 'host' ELSE 'user' END;

  IF v_sub.host_photos IS NOT NULL THEN
    SELECT array_agg(u) INTO v_host_photos FROM (SELECT unnest(v_sub.host_photos) AS u) s WHERE u IS NOT NULL AND length(trim(u)) > 0;
    SELECT array_agg(public.profile_public_media_url(u)) INTO v_public_host_photos FROM (SELECT unnest(v_sub.host_photos) AS u) s WHERE u IS NOT NULL AND length(trim(u)) > 0;
  END IF;
  v_full_name := nullif(trim(coalesce(v_sub.full_name, '')), '');
  v_language  := nullif(trim(coalesce(v_sub.language, '')), '');
  v_age       := v_sub.age;

  PERFORM set_config('app.bypass_profile_protection', 'true', true);

  UPDATE public.profiles
  SET is_host = (v_expected_gender = 'female'),
      host_status = CASE WHEN v_expected_gender = 'female' THEN 'approved' ELSE NULL END,
      is_verified = true,
      is_face_verified = true,
      face_verification_image = coalesce(v_face_url, face_verification_image),
      avatar_url = coalesce(v_public_avatar_src, v_avatar_src, avatar_url),
      profile_photo_url = coalesce(v_public_avatar_src, v_avatar_src, profile_photo_url),
      host_photos = CASE WHEN v_public_host_photos IS NOT NULL AND array_length(v_public_host_photos, 1) > 0 THEN v_public_host_photos ELSE host_photos END,
      display_name = coalesce(v_full_name, display_name),
      age = coalesce(v_age, age),
      language = coalesce(v_language, language),
      host_verified_at = CASE WHEN v_expected_gender = 'female' THEN now() ELSE host_verified_at END,
      face_verified_at = now(),
      face_verification_status = 'approved',
      updated_at = now()
  WHERE id = v_sub.user_id;

  UPDATE public.face_verification_submissions
  SET status = 'approved', verification_type = v_vt, reviewed_at = now(),
      verification_method = 'auto_rekognition',
      admin_notes = CASE
        WHEN trim(coalesce(admin_notes, '')) = '' THEN '[auto v4 2026-07-03] approved (strong=' || v_strong_identity::text || ' super_strong=' || v_super_strong::text || ').'
        ELSE trim(admin_notes) || E'\n[auto v4 2026-07-03] approved (strong=' || v_strong_identity::text || ' super_strong=' || v_super_strong::text || ').'
      END,
      updated_at = now()
  WHERE id = p_submission_id;

  RETURN jsonb_build_object(
    'success', true, 'gender', v_final, 'expected_gender', v_expected_gender, 'verification_type', v_vt,
    'strong_identity', v_strong_identity, 'super_strong', v_super_strong,
    'photo_live_score', v_photo_live, 'face_video_live_score', v_face_video_live, 'profile_match_score', v_profile_match,
    'liveness_failed_overridden', v_liveness_failed AND (v_strong_identity OR v_super_strong),
    'profile_mismatch_overridden', v_profile_mismatch AND (v_strong_identity OR v_super_strong),
    'identity_mismatch_overridden', v_identity_mismatch AND v_super_strong,
    'thresholds', jsonb_build_object('same', v_t_same, 'strong', v_t_strong, 'super', v_t_super),
    'manual_review_requested', false
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.service_auto_finalize_face_verification(p_submission_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_caller_role text;
  v_caller_user text;
BEGIN
  v_caller_role := coalesce((SELECT auth.role()), '');
  v_caller_user := current_user;
  IF v_caller_role NOT IN ('service_role','supabase_admin')
     AND v_caller_user NOT IN ('postgres','supabase_admin','supabase_auth_admin') THEN
    RETURN jsonb_build_object('success', false, 'error', 'unauthorized_caller', 'role', v_caller_role, 'user', v_caller_user);
  END IF;
  RETURN public._service_auto_finalize_face_verification_impl(p_submission_id);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.service_auto_finalize_face_verification(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.admin_set_host_status(_user_id uuid, _make_host boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _has_approved_face boolean;
  _latest_face RECORD;
  _avatar_src text;
  _public_avatar_src text;
  _public_host_photos text[];
BEGIN
  IF public.current_admin_id_from_header() IS NULL THEN
    RAISE EXCEPTION 'Access denied: admin only';
  END IF;
  IF NOT public.admin_has_any_section_permission(ARRAY['host-applications','user-management','all-hosts'], true) THEN
    RAISE EXCEPTION 'Access denied: host-applications/user-management permission required';
  END IF;
  IF public._is_target_user_owner(_user_id) THEN
    RAISE EXCEPTION 'Cannot change host status of an owner account';
  END IF;

  PERFORM set_config('app.bypass_profile_protection', 'true', true);

  IF _make_host THEN
    SELECT * INTO _latest_face
    FROM public.face_verification_submissions
    WHERE user_id = _user_id AND public.face_verification_status_bucket(status) = 'approved'
    ORDER BY coalesce(reviewed_at, updated_at, created_at) DESC NULLS LAST
    LIMIT 1;

    _has_approved_face := FOUND;

    IF _has_approved_face THEN
      _avatar_src := coalesce(_latest_face.profile_photo_url, _latest_face.front_url, _latest_face.selfie_url, _latest_face.face_image_url);
      _public_avatar_src := public.profile_public_media_url(_avatar_src);
      IF _latest_face.host_photos IS NOT NULL THEN
        SELECT array_agg(public.profile_public_media_url(u)) INTO _public_host_photos
        FROM (SELECT unnest(_latest_face.host_photos) AS u) s
        WHERE u IS NOT NULL AND length(trim(u)) > 0;
      END IF;

      UPDATE public.profiles
         SET gender = 'female', is_host = true, host_status = 'approved',
             is_face_verified = true, is_verified = true,
             avatar_url = COALESCE(_public_avatar_src, _avatar_src, avatar_url),
             profile_photo_url = COALESCE(_public_avatar_src, _avatar_src, profile_photo_url),
             face_verification_image = COALESCE(_latest_face.face_image_url, _latest_face.front_url, _latest_face.selfie_url, _latest_face.profile_photo_url, face_verification_image),
             host_photos = CASE WHEN _public_host_photos IS NOT NULL AND array_length(_public_host_photos, 1) > 0 THEN _public_host_photos ELSE host_photos END,
             face_verification_status = 'approved',
             host_level = GREATEST(COALESCE(host_level, 0), 1), updated_at = now()
       WHERE id = _user_id;
    ELSE
      INSERT INTO public.face_verification_submissions
        (user_id, verification_type, status, admin_notes, created_at)
      SELECT _user_id, 'host', 'pending',
        'Created by admin - awaiting face verification upload', now()
      WHERE NOT EXISTS (
        SELECT 1 FROM public.face_verification_submissions
        WHERE user_id = _user_id AND status IN ('pending', 'under_review'));
    END IF;
  ELSE
    UPDATE public.profiles
       SET gender = 'male', is_host = false, host_status = NULL,
           is_face_verified = false, is_verified = false,
           host_level = 0, updated_at = now()
     WHERE id = _user_id;
  END IF;

  PERFORM set_config('app.bypass_profile_protection', 'false', true);
END $function$;

GRANT EXECUTE ON FUNCTION public.admin_set_host_status(uuid, boolean) TO anon, authenticated, service_role;

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
  _avatar_src text;
  _public_avatar_src text;
  _safe_url text;
  _submission_id uuid;
  _latest_submission RECORD;
  _public_host_photos text[];
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

  SELECT id, gender, avatar_url, profile_photo_url, face_verification_image
    INTO _existing FROM public.profiles WHERE id = _user_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'User profile not found'); END IF;

  SELECT * INTO _latest_submission
  FROM public.face_verification_submissions
  WHERE user_id = _user_id
  ORDER BY coalesce(reviewed_at, updated_at, created_at) DESC NULLS LAST
  LIMIT 1;

  _final_gender := COALESCE(NULLIF(lower(trim(coalesce(_set_gender, ''))), ''), CASE WHEN _final_role = 'host' THEN 'female' ELSE 'male' END);
  IF _final_gender NOT IN ('female','male') THEN _final_gender := CASE WHEN _final_role = 'host' THEN 'female' ELSE 'male' END; END IF;
  _final_role := CASE WHEN _final_gender = 'female' THEN 'host' ELSE 'user' END;
  _face_url := COALESCE(_latest_submission.face_image_url, _latest_submission.front_url, _latest_submission.selfie_url, _latest_submission.profile_photo_url, _existing.face_verification_image, _existing.avatar_url, _existing.profile_photo_url);
  _avatar_src := COALESCE(_latest_submission.profile_photo_url, _latest_submission.front_url, _latest_submission.selfie_url, _latest_submission.face_image_url, _existing.profile_photo_url, _existing.avatar_url);
  _public_avatar_src := public.profile_public_media_url(_avatar_src);
  _safe_url := COALESCE(_face_url, 'admin-approved://no-image');

  IF _latest_submission.host_photos IS NOT NULL THEN
    SELECT array_agg(public.profile_public_media_url(u)) INTO _public_host_photos
    FROM (SELECT unnest(_latest_submission.host_photos) AS u) s
    WHERE u IS NOT NULL AND length(trim(u)) > 0;
  END IF;

  PERFORM set_config('app.bypass_profile_protection', 'true', true);

  UPDATE public.profiles
     SET is_verified = true,
         is_face_verified = true,
         face_verification_image = COALESCE(_face_url, face_verification_image),
         avatar_url = COALESCE(_public_avatar_src, _avatar_src, avatar_url),
         profile_photo_url = COALESCE(_public_avatar_src, _avatar_src, profile_photo_url),
         host_photos = CASE WHEN _public_host_photos IS NOT NULL AND array_length(_public_host_photos, 1) > 0 THEN _public_host_photos ELSE host_photos END,
         face_verification_status = 'approved',
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

GRANT EXECUTE ON FUNCTION public.admin_force_verify_and_approve_host(uuid,text,text,text) TO anon, authenticated, service_role;