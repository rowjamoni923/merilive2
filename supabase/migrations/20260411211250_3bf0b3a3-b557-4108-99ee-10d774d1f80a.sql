-- Fix is_admin function to include email fallback for legacy admins
CREATE OR REPLACE FUNCTION public.is_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admin_users
    WHERE is_active = true
      AND (
        user_id = _user_id
        OR (
          user_id IS NULL
          AND email = (SELECT email FROM auth.users WHERE id = _user_id LIMIT 1)
        )
      )
  )
$$;