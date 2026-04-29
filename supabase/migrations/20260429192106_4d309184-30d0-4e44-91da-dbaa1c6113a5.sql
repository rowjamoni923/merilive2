-- Universal fix: make is_admin() honor admin-panel session header.
-- This single change fixes ALL admin RPCs that historically gated on
-- `is_admin(auth.uid())`. Admin panel sends x-admin-token header which
-- is_active_admin_session() validates server-side.
-- User-app calls (with real auth.uid) keep the original behavior.

CREATE OR REPLACE FUNCTION public.is_admin(_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Admin panel session (x-admin-token header validated)
  IF public.is_active_admin_session() THEN
    RETURN true;
  END IF;
  -- Standard auth.users path
  IF _user_id IS NULL THEN
    RETURN false;
  END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.admin_users
    WHERE user_id = _user_id AND is_active = true
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Admin panel session
  IF public.is_active_admin_session() THEN
    RETURN true;
  END IF;
  -- Standard auth.users path
  IF auth.uid() IS NULL THEN
    RETURN false;
  END IF;
  RETURN EXISTS (
    SELECT 1
    FROM public.admin_users au
    WHERE au.is_active = true
      AND au.user_id = auth.uid()
  );
END;
$function$;