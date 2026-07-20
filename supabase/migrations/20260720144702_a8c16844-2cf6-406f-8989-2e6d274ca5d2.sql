CREATE OR REPLACE FUNCTION public.complete_face_verification_submission_uploads(_submission_id uuid, _payload jsonb)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_row public.face_verification_submissions%ROWTYPE;
  v_host_photos text[];
  v_status_bucket text;
BEGIN
  SELECT * INTO v_row
  FROM public.face_verification_submissions
  WHERE id = _submission_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Submission not found';
  END IF;

  IF auth.uid() IS DISTINCT FROM v_row.user_id AND NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  v_status_bucket := public.face_verification_status_bucket(v_row.status);
  IF v_status_bucket NOT IN ('pending', 'user_retry') THEN
    RETURN false;
  END IF;

  IF _payload ? 'host_photos' AND jsonb_typeof(_payload->'host_photos') = 'array' THEN
    SELECT array_agg(value) INTO v_host_photos
    FROM jsonb_array_elements_text(_payload->'host_photos') AS t(value);
  END IF;

  UPDATE public.face_verification_submissions
     SET status = COALESCE(NULLIF(_payload->>'status', ''), 'under_review'),
         profile_photo_url = CASE WHEN _payload ? 'profile_photo_url' THEN NULLIF(_payload->>'profile_photo_url', '') ELSE profile_photo_url END,
         video_url = CASE WHEN _payload ? 'video_url' THEN NULLIF(_payload->>'video_url', '') ELSE video_url END,
         host_photos = CASE WHEN _payload ? 'host_photos' THEN COALESCE(v_host_photos, ARRAY[]::text[]) ELSE host_photos END,
         face_image_url = CASE WHEN _payload ? 'face_image_url' THEN NULLIF(_payload->>'face_image_url', '') ELSE face_image_url END,
         selfie_url = CASE WHEN _payload ? 'selfie_url' THEN NULLIF(_payload->>'selfie_url', '') ELSE selfie_url END,
         front_url = CASE WHEN _payload ? 'front_url' THEN NULLIF(_payload->>'front_url', '') ELSE front_url END,
         left_url = CASE WHEN _payload ? 'left_url' THEN NULLIF(_payload->>'left_url', '') ELSE left_url END,
         right_url = CASE WHEN _payload ? 'right_url' THEN NULLIF(_payload->>'right_url', '') ELSE right_url END,
         is_duplicate_face = CASE WHEN _payload ? 'is_duplicate_face' THEN COALESCE((_payload->>'is_duplicate_face')::boolean, false) ELSE is_duplicate_face END,
         duplicate_face_user_id = CASE WHEN _payload ? 'duplicate_face_user_id' AND NULLIF(_payload->>'duplicate_face_user_id', '') IS NOT NULL THEN (_payload->>'duplicate_face_user_id')::uuid ELSE duplicate_face_user_id END,
         duplicate_face_name = CASE WHEN _payload ? 'duplicate_face_name' THEN NULLIF(_payload->>'duplicate_face_name', '') ELSE duplicate_face_name END,
         duplicate_face_uid = CASE WHEN _payload ? 'duplicate_face_uid' THEN NULLIF(_payload->>'duplicate_face_uid', '') ELSE duplicate_face_uid END,
         duplicate_face_avatar = CASE WHEN _payload ? 'duplicate_face_avatar' THEN NULLIF(_payload->>'duplicate_face_avatar', '') ELSE duplicate_face_avatar END,
         rejection_reason = NULL,
         reviewed_at = NULL,
         admin_notes = COALESCE(NULLIF(_payload->>'admin_notes', ''), 'User resubmitted verification after retry request.'),
         ai_analysis = (
           COALESCE(ai_analysis, '{}'::jsonb)
             - 'retry_required'
             - 'requires_resubmit'
             - 'orphan_media'
             - 'auto_rejected_reason'
             - 'analyzer_status'
             - 'analyzer_locked_at'
             - 'analyzer_locked_until'
         ) || COALESCE(_payload->'ai_analysis', '{}'::jsonb) || jsonb_build_object('retry_resubmitted_at', now()),
         updated_at = now()
   WHERE id = _submission_id
     AND public.face_verification_status_bucket(status) IN ('pending', 'user_retry');

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  DELETE FROM public.face_verification_analysis_jobs
   WHERE submission_id = _submission_id;

  PERFORM public._enqueue_face_analyze(_submission_id);

  PERFORM set_config('app.bypass_profile_protection', 'true', true);

  UPDATE public.profiles
     SET face_verification_status = 'under_review',
         is_face_verified = false,
         updated_at = now()
   WHERE id = v_row.user_id
     AND COALESCE(is_face_verified, false) = false;

  RETURN true;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.complete_face_verification_submission_uploads(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_face_verification_submission_uploads(uuid, jsonb) TO service_role;
NOTIFY pgrst, 'reload schema';