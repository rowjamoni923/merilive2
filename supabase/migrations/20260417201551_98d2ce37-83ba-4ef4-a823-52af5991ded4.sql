-- Bug #7 Fix: Remove email-based fallback from is_admin() to prevent privilege escalation
-- Previously: anyone signing up with an admin's email could gain admin access if user_id was null
-- Now: only verified user_id linkage grants admin status

CREATE OR REPLACE FUNCTION public.is_admin()
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  -- Require an authenticated user_id. No email fallback.
  IF v_uid IS NULL THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.admin_users au
    WHERE au.is_active = true
      AND au.user_id = v_uid
  );
END;
$function$;

-- Also harden the parameterized variant to require non-null and active linkage
CREATE OR REPLACE FUNCTION public.is_admin(_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN _user_id IS NULL THEN false
    ELSE EXISTS (
      SELECT 1 FROM public.admin_users au
      WHERE au.user_id = _user_id AND au.is_active = true
    )
  END;
$function$;