CREATE OR REPLACE FUNCTION public.admin_set_host_status(_user_id uuid, _make_host boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _latest_face RECORD;
  _has_approved_face boolean := false;
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
    -- Face enrichment is OPTIONAL. Conversion is INSTANT either way.
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
    END IF;

    UPDATE public.profiles
       SET gender = 'female',
           is_host = true,
           host_status = 'approved',
           is_face_verified = CASE WHEN _has_approved_face THEN true ELSE COALESCE(is_face_verified, false) END,
           is_verified = CASE WHEN _has_approved_face THEN true ELSE COALESCE(is_verified, false) END,
           avatar_url = CASE WHEN _has_approved_face THEN COALESCE(_public_avatar_src, _avatar_src, avatar_url) ELSE avatar_url END,
           profile_photo_url = CASE WHEN _has_approved_face THEN COALESCE(_public_avatar_src, _avatar_src, profile_photo_url) ELSE profile_photo_url END,
           face_verification_image = CASE WHEN _has_approved_face THEN COALESCE(_latest_face.face_image_url, _latest_face.front_url, _latest_face.selfie_url, _latest_face.profile_photo_url, face_verification_image) ELSE face_verification_image END,
           host_photos = CASE WHEN _public_host_photos IS NOT NULL AND array_length(_public_host_photos, 1) > 0 THEN _public_host_photos ELSE host_photos END,
           face_verification_status = CASE WHEN _has_approved_face THEN 'approved' ELSE face_verification_status END,
           host_level = GREATEST(COALESCE(host_level, 0), 1),
           updated_at = now()
     WHERE id = _user_id;
  ELSE
    UPDATE public.profiles
       SET gender = 'male',
           is_host = false,
           host_status = NULL,
           is_face_verified = false,
           is_verified = false,
           host_level = 0,
           updated_at = now()
     WHERE id = _user_id;
  END IF;

  -- Notify user immediately.
  INSERT INTO public.notifications (user_id, title, message, type, data)
  VALUES (_user_id,
    CASE WHEN _make_host THEN '🎤 Host Account Activated' ELSE '👤 Converted to User Account' END,
    CASE WHEN _make_host THEN 'Your account has been converted to Host. You can go live now.'
         ELSE 'Your account has been converted to a regular user account.' END,
    'system',
    jsonb_build_object('action', CASE WHEN _make_host THEN 'converted_to_host' ELSE 'converted_to_user' END));

  BEGIN
    PERFORM public.log_admin_action('admin_set_host_status', 'profile', _user_id,
      jsonb_build_object('to_host', _make_host, 'had_approved_face', _has_approved_face));
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  PERFORM set_config('app.bypass_profile_protection', 'false', true);
END $function$;