
CREATE OR REPLACE FUNCTION public.auto_finalize_face_verification(_submission_id uuid, _action text, _approve_as text DEFAULT 'user'::text, _set_gender text DEFAULT NULL::text, _reason text DEFAULT NULL::text, _tags text[] DEFAULT NULL::text[])
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _submission RECORD;
  _gender_value text;
BEGIN
  SELECT * INTO _submission FROM face_verification_submissions WHERE id = _submission_id;
  IF NOT FOUND THEN RETURN FALSE; END IF;

  _gender_value := COALESCE(_set_gender, CASE WHEN _approve_as = 'host' THEN 'female' ELSE 'male' END);

  -- Admin override: allow flipping a previously terminal (rejected/approved) submission
  PERFORM set_config('app.bypass_terminal_status_guard','true',true);
  PERFORM set_config('app.bypass_profile_protection','true',true);

  IF _action = 'approve' THEN
    UPDATE face_verification_submissions
       SET status = 'approved',
           verification_type = _approve_as,
           reviewed_at = now(),
           admin_notes = COALESCE(_reason, admin_notes),
           rejection_reason = NULL,
           updated_at = now()
     WHERE id = _submission_id;

    UPDATE profiles
       SET is_verified              = true,
           is_face_verified         = true,
           face_verification_image  = _submission.face_image_url,
           face_verification_status = 'verified',
           face_verified_at         = now(),
           is_host                  = (_approve_as = 'host'),
           host_status              = CASE WHEN _approve_as = 'host' THEN 'approved' ELSE NULL END,
           gender                   = _gender_value,
           updated_at               = now()
     WHERE id = _submission.user_id;

  ELSIF _action = 'reject' THEN
    UPDATE face_verification_submissions
       SET status = 'rejected',
           reviewed_at = now(),
           rejection_reason = COALESCE(_reason, rejection_reason),
           updated_at = now()
     WHERE id = _submission_id;

    UPDATE profiles
       SET is_face_verified         = false,
           face_verification_image  = NULL,
           face_verification_status = 'rejected',
           face_verified_at         = NULL,
           updated_at               = now()
     WHERE id = _submission.user_id;

  ELSIF _action = 'under_review' THEN
    UPDATE face_verification_submissions
       SET status = 'under_review',
           admin_notes = COALESCE(_reason, admin_notes),
           updated_at = now()
     WHERE id = _submission_id;

    UPDATE profiles
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
