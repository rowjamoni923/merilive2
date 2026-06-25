CREATE OR REPLACE FUNCTION public.service_auto_finalize_face_verification(p_submission_id uuid)
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
  v_fl numeric;
  v_fr numeric;
  v_face_conf numeric;
  v_age_high int;
  v_occ numeric;
  v_final text;
  v_raw_gender text;
  v_detected_gender text;
  v_gender_conflict boolean;
  v_enabled text;
  v_face_url text;
  v_avatar_src text;
  v_vt text;
  v_face_count int;
  v_left_count int;
  v_right_count int;
  v_front_err text;
  v_left_err text;
  v_right_err text;
  v_front_yaw numeric;
  v_left_yaw numeric;
  v_right_yaw numeric;
  v_left_delta numeric;
  v_right_delta numeric;
  v_lr_delta numeric;
  v_profile_gender text;
  v_profile_is_host boolean;
  v_expected_gender text;
  v_replay_suspected boolean;
  v_liveness_failed boolean;
  v_profile_mismatch boolean;
  v_duplicate_face boolean;
  v_passive_scan boolean;
  v_dup_name text;
  v_dup_uid text;
  v_reject_reason text;
BEGIN
  IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
    RETURN jsonb_build_object('success', false, 'error', 'service_role only');
  END IF;

  SELECT setting_value::text INTO v_enabled
  FROM public.app_settings
  WHERE setting_key = 'face_verification_auto_approve_enabled'
  LIMIT 1;

  IF lower(trim(both '"' from trim(coalesce(v_enabled, '')))) NOT IN ('1', 'true', 't', 'yes') THEN
    RETURN jsonb_build_object('success', false, 'reason', 'auto_disabled');
  END IF;

  SELECT * INTO v_sub
  FROM public.face_verification_submissions
  WHERE id = p_submission_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'submission_not_found');
  END IF;

  IF public.face_verification_status_bucket(v_sub.status) IS DISTINCT FROM 'pending' THEN
    RETURN jsonb_build_object('success', false, 'reason', 'wrong_status', 'status', v_sub.status);
  END IF;

  SELECT lower(trim(coalesce(gender, ''))), coalesce(is_host, false)
  INTO v_profile_gender, v_profile_is_host
  FROM public.profiles
  WHERE id = v_sub.user_id;

  v_expected_gender := CASE
    WHEN lower(trim(coalesce(v_sub.verification_type, ''))) = 'host' THEN 'female'
    WHEN lower(trim(coalesce(v_sub.verification_type, ''))) IN ('user', 'face') THEN 'male'
    WHEN v_profile_gender IN ('male', 'female') THEN v_profile_gender
    WHEN v_profile_is_host THEN 'female'
    ELSE 'male'
  END;

  v_auto := coalesce(v_sub.ai_analysis, '{}'::jsonb) -> 'rekognition';
  v_passive_scan := coalesce(v_sub.ai_analysis ->> 'scan_mode', '') = 'passive_photo_video_live';

  IF v_auto IS NULL OR v_auto = 'null'::jsonb THEN
    RETURN jsonb_build_object('success', false, 'reason', 'no_rekognition_block', 'expected_gender', v_expected_gender);
  END IF;

  v_gender_conf := CASE WHEN coalesce(v_auto ->> 'gender_confidence', '') ~ '^-?\d+(\.\d+)?$' THEN (v_auto ->> 'gender_confidence')::numeric ELSE 0 END;
  v_final := lower(trim(coalesce(v_auto ->> 'final_gender', '')));
  v_raw_gender := lower(trim(coalesce(v_auto ->> 'gender_value', '')));
  v_detected_gender := CASE
    WHEN v_raw_gender IN ('male', 'female') THEN v_raw_gender
    WHEN v_final IN ('male', 'female') THEN v_final
    ELSE ''
  END;
  v_gender_conflict := lower(trim(coalesce(v_auto ->> 'gender_conflict', 'false'))) IN ('1','true','t','yes');
  v_front_err := trim(coalesce(v_auto ->> 'front_error', ''));
  v_duplicate_face := coalesce(v_sub.is_duplicate_face, false) OR coalesce(v_sub.ai_analysis ? 'duplicate_account', false);

  IF v_duplicate_face THEN
    v_dup_name := coalesce(v_sub.duplicate_face_name, v_sub.ai_analysis #>> '{duplicate_account,previous_display_name}', 'Existing Account');
    v_dup_uid := coalesce(v_sub.duplicate_face_uid, v_sub.ai_analysis #>> '{duplicate_account,previous_app_uid}', 'Unknown');
    v_reject_reason := format('This face is already registered with another account: %s (ID: %s). One face can only be used for one account. Please contact Support Chat if you believe this is an error.', v_dup_name, v_dup_uid);

    UPDATE public.face_verification_submissions
    SET status = 'rejected',
        rejection_reason = v_reject_reason,
        reviewed_at = coalesce(reviewed_at, now()),
        admin_notes = concat_ws(E'\n', nullif(trim(coalesce(admin_notes, '')), ''), format('[auto-reject] duplicate_face DB guard: existing_account_name=%s existing_account_uid=%s', v_dup_name, v_dup_uid)),
        updated_at = now()
    WHERE id = p_submission_id;

    UPDATE public.profiles
    SET is_face_verified = false,
        face_verification_status = 'rejected',
        updated_at = now()
    WHERE id = v_sub.user_id;

    RETURN jsonb_build_object('success', false, 'reason', 'duplicate_face', 'auto_rejected', true, 'manual_review_requested', false, 'expected_gender', v_expected_gender);
  END IF;

  IF v_expected_gender IN ('male', 'female')
     AND v_detected_gender IN ('male', 'female')
     AND v_detected_gender <> v_expected_gender
     AND v_gender_conf >= 90
     AND v_front_err = ''
     AND NOT v_gender_conflict THEN
    v_reject_reason := format('Account type mismatch detected. This face scan does not match the selected %s account type. Please contact Support Chat to resolve this.', CASE WHEN v_expected_gender = 'female' THEN 'host' ELSE 'user' END);

    UPDATE public.face_verification_submissions
    SET status = 'rejected',
        rejection_reason = v_reject_reason,
        reviewed_at = coalesce(reviewed_at, now()),
        admin_notes = concat_ws(E'\n', nullif(trim(coalesce(admin_notes, '')), ''), format('[auto-reject] gender_mismatch DB guard: expected=%s detected=%s confidence=%.1f%%', v_expected_gender, v_detected_gender, v_gender_conf)),
        updated_at = now()
    WHERE id = p_submission_id;

    UPDATE public.profiles
    SET is_face_verified = false,
        face_verification_status = 'rejected',
        updated_at = now()
    WHERE id = v_sub.user_id;

    RETURN jsonb_build_object('success', false, 'reason', 'account_gender_mismatch', 'auto_rejected', true, 'manual_review_requested', false, 'expected_gender', v_expected_gender, 'detected_gender', v_detected_gender, 'gender_confidence', v_gender_conf);
  END IF;

  v_manual_flag := lower(trim(coalesce(v_sub.ai_analysis ->> 'manual_review_required', 'false'))) IN ('1','true','t','yes');
  IF v_manual_flag THEN
    RETURN jsonb_build_object('success', false, 'reason', 'client_manual_review_required', 'manual_review_requested', true, 'expected_gender', v_expected_gender);
  END IF;

  v_replay_suspected := lower(trim(coalesce(v_auto ->> 'replay_suspected', 'false'))) IN ('1','true','t','yes');
  v_liveness_failed := lower(trim(coalesce(v_auto ->> 'liveness_failed', 'false'))) IN ('1','true','t','yes');
  v_profile_mismatch := lower(trim(coalesce(v_auto ->> 'profile_mismatch', 'false'))) IN ('1','true','t','yes');

  IF v_replay_suspected AND NOT v_passive_scan THEN
    RETURN jsonb_build_object('success', false, 'reason', 'replay_suspected', 'manual_review_requested', true, 'expected_gender', v_expected_gender);
  END IF;
  IF v_liveness_failed THEN
    RETURN jsonb_build_object('success', false, 'reason', 'liveness_failed', 'manual_review_requested', true, 'expected_gender', v_expected_gender);
  END IF;
  IF v_profile_mismatch THEN
    RETURN jsonb_build_object('success', false, 'reason', 'profile_face_mismatch', 'manual_review_requested', true, 'expected_gender', v_expected_gender);
  END IF;

  v_face_count := CASE WHEN coalesce(v_auto ->> 'face_count', '') ~ '^-?\d+$' THEN (v_auto ->> 'face_count')::int ELSE -1 END;
  v_left_count := CASE WHEN coalesce(v_auto ->> 'left_face_count', '') ~ '^-?\d+$' THEN (v_auto ->> 'left_face_count')::int ELSE -1 END;
  v_right_count := CASE WHEN coalesce(v_auto ->> 'right_face_count', '') ~ '^-?\d+$' THEN (v_auto ->> 'right_face_count')::int ELSE -1 END;

  IF v_face_count IS DISTINCT FROM 1 THEN
    RETURN jsonb_build_object('success', false, 'reason', 'invalid_face_count', 'face_count', v_face_count, 'manual_review_requested', true, 'expected_gender', v_expected_gender);
  END IF;
  IF v_left_count IS DISTINCT FROM 1 OR v_right_count IS DISTINCT FROM 1 THEN
    RETURN jsonb_build_object('success', false, 'reason', 'invalid_side_face_count', 'left_face_count', v_left_count, 'right_face_count', v_right_count, 'manual_review_requested', true, 'expected_gender', v_expected_gender);
  END IF;

  v_left_err := trim(coalesce(v_auto ->> 'left_error', ''));
  v_right_err := trim(coalesce(v_auto ->> 'right_error', ''));
  IF v_front_err <> '' OR v_left_err <> '' OR v_right_err <> '' THEN
    RETURN jsonb_build_object('success', false, 'reason', 'angle_error', 'front_error', nullif(v_front_err,''), 'left_error', nullif(v_left_err,''), 'right_error', nullif(v_right_err,''), 'manual_review_requested', true, 'expected_gender', v_expected_gender);
  END IF;

  v_fl := coalesce(nullif(v_auto ->> 'compare_front_left', '')::numeric, 0);
  v_fr := coalesce(nullif(v_auto ->> 'compare_front_right', '')::numeric, 0);
  v_face_conf := coalesce(nullif(v_auto ->> 'face_confidence', '')::numeric, 0);
  v_age_high := coalesce(nullif(v_auto ->> 'age_range_high', '')::int, 99);
  v_occ := coalesce(nullif(v_auto ->> 'face_occluded_confidence', '')::numeric, 0);
  v_front_yaw := nullif(v_auto ->> 'front_pose_yaw', '')::numeric;
  v_left_yaw := nullif(v_auto ->> 'left_pose_yaw', '')::numeric;
  v_right_yaw := nullif(v_auto ->> 'right_pose_yaw', '')::numeric;

  IF v_final NOT IN ('male', 'female') THEN
    RETURN jsonb_build_object('success', false, 'reason', 'invalid_final_gender', 'manual_review_requested', true, 'expected_gender', v_expected_gender);
  END IF;

  IF v_expected_gender IN ('male', 'female') AND v_final <> v_expected_gender THEN
    RETURN jsonb_build_object('success', false, 'reason', 'account_gender_mismatch', 'expected_gender', v_expected_gender, 'detected_gender', v_final, 'gender_confidence', v_gender_conf, 'manual_review_requested', true);
  END IF;

  IF v_gender_conf < 70 OR v_face_conf < 70 THEN
    RETURN jsonb_build_object('success', false, 'reason', 'below_thresholds',
      'gender_confidence', v_gender_conf, 'face_confidence', v_face_conf,
      'compare_front_left', v_fl, 'compare_front_right', v_fr,
      'manual_review_requested', true, 'expected_gender', v_expected_gender);
  END IF;

  IF v_fl < 55 OR v_fr < 55 THEN
    RETURN jsonb_build_object('success', false, 'reason', 'low_similarity',
      'compare_front_left', v_fl, 'compare_front_right', v_fr,
      'manual_review_requested', true, 'expected_gender', v_expected_gender);
  END IF;

  IF NOT v_passive_scan AND v_front_yaw IS NOT NULL AND v_left_yaw IS NOT NULL AND v_right_yaw IS NOT NULL THEN
    v_left_delta := abs(v_left_yaw - v_front_yaw);
    v_right_delta := abs(v_right_yaw - v_front_yaw);
    v_lr_delta := abs(v_left_yaw - v_right_yaw);
    IF v_left_delta < 8 AND v_right_delta < 8 THEN
      RETURN jsonb_build_object('success', false, 'reason', 'insufficient_side_pose',
        'front_pose_yaw', v_front_yaw, 'left_pose_yaw', v_left_yaw, 'right_pose_yaw', v_right_yaw,
        'manual_review_requested', true, 'expected_gender', v_expected_gender);
    END IF;
    IF v_lr_delta < 12 THEN
      RETURN jsonb_build_object('success', false, 'reason', 'insufficient_left_right_pose_gap',
        'front_pose_yaw', v_front_yaw, 'left_pose_yaw', v_left_yaw, 'right_pose_yaw', v_right_yaw,
        'manual_review_requested', true, 'expected_gender', v_expected_gender);
    END IF;
  END IF;

  IF v_age_high < 18 THEN
    RETURN jsonb_build_object('success', false, 'reason', 'underage', 'manual_review_requested', true, 'expected_gender', v_expected_gender);
  END IF;

  IF v_occ > 95 THEN
    RETURN jsonb_build_object('success', false, 'reason', 'face_occluded', 'manual_review_requested', true, 'expected_gender', v_expected_gender);
  END IF;

  v_face_url := coalesce(v_sub.front_url, v_sub.selfie_url, v_sub.profile_photo_url, v_sub.face_image_url);
  v_avatar_src := coalesce(v_sub.profile_photo_url, v_sub.front_url, v_sub.selfie_url);
  v_vt := CASE WHEN v_expected_gender = 'female' THEN 'host' ELSE 'user' END;

  PERFORM set_config('app.bypass_profile_protection', 'true', true);

  UPDATE public.profiles
  SET is_host = (v_expected_gender = 'female'),
      host_status = CASE WHEN v_expected_gender = 'female' THEN 'approved' ELSE NULL END,
      is_verified = true,
      is_face_verified = true,
      face_verification_image = coalesce(v_face_url, face_verification_image),
      avatar_url = coalesce(v_avatar_src, avatar_url),
      face_verified_at = now(),
      face_verification_status = 'approved',
      updated_at = now()
  WHERE id = v_sub.user_id;

  UPDATE public.face_verification_submissions
  SET status = 'approved',
      verification_type = v_vt,
      reviewed_at = now(),
      admin_notes = CASE
        WHEN trim(coalesce(admin_notes, '')) = '' THEN
          '[auto] service_auto_finalize_face_verification: strict duplicate/gender/liveness/Rekognition checks passed.'
        ELSE
          trim(admin_notes) || E'\n[auto] service_auto_finalize_face_verification: strict duplicate/gender/liveness/Rekognition checks passed.'
      END,
      updated_at = now()
  WHERE id = p_submission_id;

  RETURN jsonb_build_object(
    'success', true,
    'gender', v_final,
    'expected_gender', v_expected_gender,
    'verification_type', v_vt,
    'scan_mode', CASE WHEN v_passive_scan THEN 'passive_photo_video_live' ELSE 'pose_challenge' END,
    'avatar_set', v_avatar_src IS NOT NULL,
    'compare_front_left', v_fl,
    'compare_front_right', v_fr,
    'manual_review_requested', false
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.service_auto_finalize_face_verification(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.service_auto_finalize_face_verification(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.tg_auto_reject_face_gender_mismatch()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rek jsonb;
  v_final text;
  v_raw text;
  v_expected text;
  v_gender_conf numeric;
  v_gender_conflict boolean;
  v_profile_gender text;
  v_profile_is_host boolean;
  v_front_err text;
  v_detected text;
  v_duplicate_face boolean;
  v_dup_name text;
  v_dup_uid text;
BEGIN
  IF public.face_verification_status_bucket(NEW.status) IS DISTINCT FROM 'pending' THEN
    RETURN NEW;
  END IF;

  v_rek := coalesce(NEW.ai_analysis, '{}'::jsonb) -> 'rekognition';
  IF v_rek IS NULL OR v_rek = 'null'::jsonb THEN
    RETURN NEW;
  END IF;

  v_duplicate_face := coalesce(NEW.is_duplicate_face, false) OR coalesce(NEW.ai_analysis ? 'duplicate_account', false);
  IF v_duplicate_face THEN
    v_dup_name := coalesce(NEW.duplicate_face_name, NEW.ai_analysis #>> '{duplicate_account,previous_display_name}', 'Existing Account');
    v_dup_uid := coalesce(NEW.duplicate_face_uid, NEW.ai_analysis #>> '{duplicate_account,previous_app_uid}', 'Unknown');
    NEW.status := 'rejected';
    NEW.reviewed_at := coalesce(NEW.reviewed_at, now());
    NEW.rejection_reason := format('This face is already registered with another account: %s (ID: %s). One face can only be used for one account. Please contact Support Chat if you believe this is an error.', v_dup_name, v_dup_uid);
    NEW.admin_notes := concat_ws(E'\n', nullif(trim(coalesce(NEW.admin_notes, '')), ''), format('[auto-reject] duplicate_face trigger: existing_account_name=%s existing_account_uid=%s', v_dup_name, v_dup_uid));
    NEW.updated_at := now();
    RETURN NEW;
  END IF;

  v_final := lower(trim(coalesce(v_rek ->> 'final_gender', '')));
  v_raw := lower(trim(coalesce(v_rek ->> 'gender_value', '')));
  v_detected := CASE
    WHEN v_raw IN ('male', 'female') THEN v_raw
    WHEN v_final IN ('male', 'female') THEN v_final
    ELSE ''
  END;
  v_gender_conf := CASE
    WHEN coalesce(v_rek ->> 'gender_confidence', '') ~ '^-?\d+(\.\d+)?$' THEN (v_rek ->> 'gender_confidence')::numeric
    ELSE 0
  END;
  v_gender_conflict := lower(trim(coalesce(v_rek ->> 'gender_conflict', 'false'))) IN ('1','true','t','yes');
  v_front_err := trim(coalesce(v_rek ->> 'front_error', ''));

  SELECT lower(trim(coalesce(gender, ''))), coalesce(is_host, false)
  INTO v_profile_gender, v_profile_is_host
  FROM public.profiles
  WHERE id = NEW.user_id;

  v_expected := CASE
    WHEN lower(trim(coalesce(NEW.verification_type, ''))) = 'host' THEN 'female'
    WHEN lower(trim(coalesce(NEW.verification_type, ''))) IN ('user', 'face') THEN 'male'
    WHEN v_profile_gender IN ('male', 'female') THEN v_profile_gender
    WHEN v_profile_is_host THEN 'female'
    ELSE 'male'
  END;

  IF v_expected IN ('male', 'female')
     AND v_detected IN ('male', 'female')
     AND v_detected <> v_expected
     AND v_gender_conf >= 90
     AND v_front_err = ''
     AND NOT v_gender_conflict THEN
    NEW.status := 'rejected';
    NEW.reviewed_at := coalesce(NEW.reviewed_at, now());
    NEW.rejection_reason := format(
      'Account type mismatch detected. This face scan does not match the selected %s account type. Please contact Support Chat to resolve.',
      CASE WHEN v_expected = 'female' THEN 'host' ELSE 'user' END
    );
    NEW.admin_notes := concat_ws(E'\n', nullif(trim(coalesce(NEW.admin_notes, '')), ''), format(
      '[auto-reject] gender_mismatch trigger: expected=%s detected=%s confidence=%.1f%%',
      v_expected,
      v_detected,
      v_gender_conf
    ));
    NEW.updated_at := now();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_reject_face_gender_mismatch ON public.face_verification_submissions;
CREATE TRIGGER trg_auto_reject_face_gender_mismatch
BEFORE INSERT OR UPDATE OF ai_analysis, status, verification_type, is_duplicate_face, duplicate_face_user_id
ON public.face_verification_submissions
FOR EACH ROW
EXECUTE FUNCTION public.tg_auto_reject_face_gender_mismatch();

REVOKE ALL ON FUNCTION public.tg_auto_reject_face_gender_mismatch() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tg_auto_reject_face_gender_mismatch() TO service_role;