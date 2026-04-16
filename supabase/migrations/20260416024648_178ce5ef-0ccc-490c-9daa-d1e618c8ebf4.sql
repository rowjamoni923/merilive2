
-- 1) Backfill missing admin_users.user_id by matching auth user email
UPDATE public.admin_users au
SET user_id = u.id,
    updated_at = now()
FROM auth.users u
WHERE au.user_id IS NULL
  AND au.is_active = true
  AND lower(au.email) = lower(u.email::text);

-- 2) Make zero-arg is_admin() resilient to legacy email-linked admins
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
BEGIN
  IF v_uid IS NULL AND v_email = '' THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.admin_users au
    WHERE au.is_active = true
      AND (
        (v_uid IS NOT NULL AND au.user_id = v_uid)
        OR (v_email <> '' AND lower(au.email) = v_email)
      )
  );
END;
$$;

-- 3) Make is_admin(uuid) consistent with the same fallback for current signed-in admin
CREATE OR REPLACE FUNCTION public.is_admin(_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
BEGIN
  IF _user_id IS NULL THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.admin_users au
    WHERE au.is_active = true
      AND (
        au.user_id = _user_id
        OR (_user_id = auth.uid() AND v_email <> '' AND lower(au.email) = v_email)
      )
  );
END;
$$;
