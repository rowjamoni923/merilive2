CREATE OR REPLACE FUNCTION public.auto_convert_account_by_gender()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  NEW.gender := lower(NULLIF(BTRIM(COALESCE(NEW.gender, '')), ''));

  IF NEW.gender = 'female' THEN
    NEW.is_host := true;

    IF COALESCE(NEW.is_face_verified, false) IS TRUE
       OR NEW.face_verification_status = 'approved' THEN
      NEW.is_face_verified := true;
      NEW.face_verification_status := 'approved';
      IF NEW.host_status IS NULL OR NEW.host_status NOT IN ('blocked','rejected') THEN
        NEW.host_status := 'approved';
      END IF;
    ELSE
      IF NEW.host_status IS NULL OR NEW.host_status = '' OR NEW.host_status = 'approved' THEN
        NEW.host_status := 'pending_face';
      END IF;
      NEW.is_face_verified := false;
      NEW.face_verification_status := COALESCE(NULLIF(NEW.face_verification_status, ''), 'pending');
    END IF;
  ELSIF NEW.gender = 'male' THEN
    NEW.is_host := false;
    NEW.host_status := NULL;
    IF COALESCE(NEW.is_face_verified, false) IS TRUE
       OR NEW.face_verification_status = 'approved' THEN
      NEW.is_face_verified := true;
      NEW.face_verification_status := 'approved';
    ELSE
      NEW.is_face_verified := false;
      NEW.face_verification_status := COALESCE(NULLIF(NEW.face_verification_status, ''), 'pending');
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.enforce_host_face_invariant()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.face_verification_status = 'approved' THEN
    NEW.is_face_verified := true;
  END IF;

  -- Host profile identity and host privilege are intentionally separate:
  -- female signup/admin conversion stores is_host=true immediately, while
  -- host_status='approved' + face approval controls go-live/homepage visibility.
  IF COALESCE(NEW.is_host,false) = true
     AND (NEW.face_verification_status IS DISTINCT FROM 'approved'
          OR COALESCE(NEW.is_face_verified,false) = false) THEN
    IF NEW.host_status IS NULL OR NEW.host_status = '' OR NEW.host_status = 'approved' THEN
      NEW.host_status := 'pending_face';
    END IF;
    IF NEW.face_verification_status IS NULL OR NEW.face_verification_status = '' THEN
      NEW.face_verification_status := 'pending';
    END IF;
  END IF;

  IF NEW.host_status = 'approved'
     AND NEW.face_verification_status = 'approved'
     AND COALESCE(NEW.is_face_verified,false) = true THEN
    NEW.is_host := true;
  END IF;

  RETURN NEW;
END;
$function$;

DO $$
BEGIN
  PERFORM set_config('app.bypass_profile_protection', 'true', true);

  UPDATE public.profiles
  SET is_host = true,
      host_status = CASE
        WHEN host_status IN ('blocked','rejected') THEN host_status
        WHEN is_face_verified IS TRUE OR face_verification_status = 'approved' THEN 'approved'
        ELSE 'pending_face'
      END,
      face_verification_status = CASE
        WHEN is_face_verified IS TRUE OR face_verification_status = 'approved' THEN 'approved'
        ELSE COALESCE(NULLIF(face_verification_status, ''), 'pending')
      END,
      updated_at = now()
  WHERE gender = 'female'
    AND COALESCE(is_host, false) = false;

  PERFORM set_config('app.bypass_profile_protection', 'false', true);
END $$;