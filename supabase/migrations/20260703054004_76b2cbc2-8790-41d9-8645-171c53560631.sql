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
  _host_photos text[];
  _admin_id uuid;
BEGIN
  SELECT * INTO _submission FROM public.face_verification_submissions WHERE id = _submission_id;
  IF NOT FOUND THEN RETURN FALSE; END IF;

  _admin_id := public.current_admin_id_from_header();
  _gender_value := COALESCE(NULLIF(_set_gender, ''), CASE WHEN _approve_as = 'host' THEN 'female' ELSE 'male' END);
  _face_url := COALESCE(_submission.face_image_url, _submission.front_url, _submission.selfie_url, _submission.profile_photo_url);
  _avatar_src := COALESCE(_submission.profile_photo_url, _submission.front_url, _submission.selfie_url, _submission.face_image_url);

  IF _submission.host_photos IS NOT NULL THEN
    SELECT array_agg(u) INTO _host_photos
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
           avatar_url               = COALESCE(_avatar_src, avatar_url),
           profile_photo_url        = COALESCE(_avatar_src, profile_photo_url),
           host_photos              = CASE WHEN _host_photos IS NOT NULL AND array_length(_host_photos, 1) > 0 THEN _host_photos ELSE host_photos END,
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