-- Fix: check_profile_update_security referenced NEW.role and NEW.level which
-- do not exist on the profiles table. This caused EVERY profile UPDATE to
-- fail with: record "new" has no field "role"
-- Symptoms included: stuck "Loading your account" screen on Profile route,
-- session validation errors, and various write failures throughout the app.
CREATE OR REPLACE FUNCTION public.check_profile_update_security()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Skip when running in a privileged context
  IF current_setting('app.bypass_profile_protection', true) = 'true' THEN
    RETURN NEW;
  END IF;

  -- Allow when an active admin session is present (admin panel writes)
  IF public.is_active_admin_session() THEN
    RETURN NEW;
  END IF;

  -- Allow internal automatic transitions (face-verification host promotion etc)
  IF TG_OP = 'UPDATE' AND OLD.id = NEW.id THEN
    -- Female face-verification auto-promotion
    IF OLD.is_face_verified IS DISTINCT FROM NEW.is_face_verified THEN
      RETURN NEW;
    END IF;
  END IF;

  -- Block sensitive column changes for non-admins
  -- NOTE: 'role' and 'level' columns do not exist on profiles; removed.
  IF TG_OP = 'UPDATE' THEN
    IF NEW.diamonds        IS DISTINCT FROM OLD.diamonds
    OR NEW.beans           IS DISTINCT FROM OLD.beans
    OR NEW.coins           IS DISTINCT FROM OLD.coins
    OR NEW.is_host         IS DISTINCT FROM OLD.is_host
    OR NEW.host_status     IS DISTINCT FROM OLD.host_status
    OR NEW.total_recharged IS DISTINCT FROM OLD.total_recharged
    THEN
      IF auth.uid() IS NULL OR NOT public.is_admin(auth.uid()) THEN
        RAISE EXCEPTION 'profile sensitive field change not allowed';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;