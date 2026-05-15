CREATE OR REPLACE FUNCTION public.admin_get_my_admin_user()
RETURNS TABLE(id uuid, email text, display_name text, role text, support_display_name text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_id uuid;
BEGIN
  v_admin_id := public.current_admin_id_from_header();

  IF v_admin_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT u.id, u.email, u.display_name, u.role::text, u.support_display_name
  FROM public.admin_users u
  WHERE u.id = v_admin_id
    AND COALESCE(u.is_active, true) = true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_get_my_admin_user() TO anon, authenticated;