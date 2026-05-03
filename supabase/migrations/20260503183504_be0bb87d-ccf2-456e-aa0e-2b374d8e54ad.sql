CREATE OR REPLACE FUNCTION public.sync_host_role_from_face_verification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.gender = 'female' THEN
    IF NEW.is_face_verified IS TRUE AND (OLD.is_face_verified IS DISTINCT FROM TRUE) THEN
      NEW.is_host := true;
      IF NEW.host_status IS NULL OR NEW.host_status NOT IN ('blocked','rejected') THEN
        NEW.host_status := 'approved';
      END IF;
      -- Make her instantly visible on the homepage feed (no logout/Go-Offline dance required)
      NEW.is_online := true;
      NEW.last_seen_at := now();
      IF NEW.host_availability IS NULL OR NEW.host_availability = 'offline' THEN
        NEW.host_availability := 'online';
      END IF;
    ELSIF NEW.is_face_verified IS NOT TRUE AND OLD.is_face_verified IS TRUE THEN
      NEW.is_host := false;
      IF NEW.host_status = 'approved' THEN
        NEW.host_status := 'pending_face';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;