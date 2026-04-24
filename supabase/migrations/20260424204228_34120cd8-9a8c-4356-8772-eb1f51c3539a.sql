-- Add Rekognition tracking columns to face_verification_submissions
ALTER TABLE public.face_verification_submissions
  ADD COLUMN IF NOT EXISTS match_confidence numeric(5,2),
  ADD COLUMN IF NOT EXISTS face_rekognition_id text,
  ADD COLUMN IF NOT EXISTS rekognition_external_id text,
  ADD COLUMN IF NOT EXISTS duplicate_of_user_id uuid,
  ADD COLUMN IF NOT EXISTS verification_method text DEFAULT 'manual';

CREATE INDEX IF NOT EXISTS idx_fvs_face_rekognition_id
  ON public.face_verification_submissions(face_rekognition_id)
  WHERE face_rekognition_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_fvs_duplicate_of_user_id
  ON public.face_verification_submissions(duplicate_of_user_id)
  WHERE duplicate_of_user_id IS NOT NULL;

-- Function: ban_duplicate_face_user — auto-ban when Rekognition detects duplicate face
CREATE OR REPLACE FUNCTION public.ban_duplicate_face_user(
  _user_id uuid,
  _original_user_id uuid,
  _confidence numeric,
  _rekognition_face_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _result jsonb;
BEGIN
  -- Block the user
  PERFORM set_config('app.bypass_profile_protection', 'true', true);

  UPDATE public.profiles
  SET is_blocked = true,
      host_status = 'rejected',
      is_face_verified = false,
      updated_at = now()
  WHERE id = _user_id;

  -- Mark all submissions from this user as rejected (duplicate)
  UPDATE public.face_verification_submissions
  SET status = 'rejected',
      rejection_reason = format('Duplicate face detected — already verified under another account (confidence: %s%%)', _confidence::text),
      duplicate_of_user_id = _original_user_id,
      reviewed_at = now()
  WHERE user_id = _user_id
    AND status IN ('pending', 'submitted');

  -- Add face hash to banned list to prevent re-registration
  INSERT INTO public.banned_face_hashes (face_hash, user_id, reason, banned_by)
  VALUES (
    _rekognition_face_id,
    _user_id,
    format('Duplicate of user %s (Rekognition match %s%%)', _original_user_id::text, _confidence::text),
    NULL
  )
  ON CONFLICT DO NOTHING;

  -- Log admin action
  INSERT INTO public.admin_logs (action_type, target_id, target_type, details)
  VALUES (
    'auto_ban_duplicate_face',
    _user_id,
    'profile',
    jsonb_build_object(
      'original_user_id', _original_user_id,
      'confidence', _confidence,
      'rekognition_face_id', _rekognition_face_id,
      'detected_at', now()
    )
  );

  PERFORM set_config('app.bypass_profile_protection', 'false', true);

  _result := jsonb_build_object(
    'banned', true,
    'user_id', _user_id,
    'duplicate_of', _original_user_id,
    'confidence', _confidence
  );

  RETURN _result;
END;
$$;

REVOKE ALL ON FUNCTION public.ban_duplicate_face_user(uuid, uuid, numeric, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ban_duplicate_face_user(uuid, uuid, numeric, text) TO service_role;

-- Function: process_face_verification_v3 — DB-side wrapper called by edge function after Rekognition results
CREATE OR REPLACE FUNCTION public.process_face_verification_v3(
  p_user_id uuid,
  p_is_match boolean,
  p_confidence numeric,
  p_face_rekognition_id text,
  p_profile_photo_url text,
  p_live_face_url text DEFAULT NULL,
  p_duplicate_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _submission_id uuid;
  _result jsonb;
BEGIN
  -- Duplicate detected → ban user
  IF p_duplicate_user_id IS NOT NULL AND p_duplicate_user_id <> p_user_id THEN
    PERFORM public.ban_duplicate_face_user(
      p_user_id,
      p_duplicate_user_id,
      p_confidence,
      p_face_rekognition_id
    );

    RETURN jsonb_build_object(
      'isMatch', false,
      'confidence', p_confidence,
      'error_code', 'DUPLICATE_FACE',
      'duplicate_of', p_duplicate_user_id,
      'banned', true
    );
  END IF;

  -- Insert/update submission record
  INSERT INTO public.face_verification_submissions (
    user_id,
    face_image_url,
    profile_image_url,
    status,
    match_confidence,
    face_rekognition_id,
    verification_method,
    submitted_at,
    reviewed_at
  ) VALUES (
    p_user_id,
    COALESCE(p_live_face_url, p_profile_photo_url),
    p_profile_photo_url,
    CASE WHEN p_is_match AND p_confidence >= 90 THEN 'approved' ELSE 'rejected' END,
    p_confidence,
    p_face_rekognition_id,
    'rekognition_v3',
    now(),
    now()
  )
  RETURNING id INTO _submission_id;

  -- Auto-approve if confidence > 90%
  IF p_is_match AND p_confidence >= 90 THEN
    PERFORM set_config('app.bypass_profile_protection', 'true', true);

    UPDATE public.profiles
    SET is_face_verified = true,
        face_verification_image = COALESCE(p_live_face_url, p_profile_photo_url),
        updated_at = now()
    WHERE id = p_user_id;

    PERFORM set_config('app.bypass_profile_protection', 'false', true);

    _result := jsonb_build_object(
      'isMatch', true,
      'confidence', p_confidence,
      'submission_id', _submission_id,
      'status', 'approved',
      'face_rekognition_id', p_face_rekognition_id
    );
  ELSE
    _result := jsonb_build_object(
      'isMatch', false,
      'confidence', p_confidence,
      'submission_id', _submission_id,
      'status', 'rejected',
      'error_code', CASE WHEN p_confidence < 90 THEN 'LOW_CONFIDENCE' ELSE 'NO_MATCH' END
    );
  END IF;

  RETURN _result;
END;
$$;

REVOKE ALL ON FUNCTION public.process_face_verification_v3(uuid, boolean, numeric, text, text, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_face_verification_v3(uuid, boolean, numeric, text, text, text, uuid) TO service_role;