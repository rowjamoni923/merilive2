-- Treat 'owner' as implicitly satisfying the 'admin' role check.
-- All admin_only RPCs and RLS policies route through public.has_role(uid, 'admin').
-- Owners are stored in admin_users with role='owner', so the strict equality
-- previously rejected them. Owners should always pass admin gates.

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role text)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF _user_id IS NULL THEN
    RETURN false;
  END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.admin_users
     WHERE user_id = _user_id
       AND is_active = true
       AND (
         role::text = _role
         OR role::text = 'owner'  -- Owner satisfies any admin-tier role check
       )
  );
END;
$function$;

NOTIFY pgrst, 'reload schema';