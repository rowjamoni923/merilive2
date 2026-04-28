CREATE OR REPLACE FUNCTION public.current_admin_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.current_admin_id_from_header();
$$;

GRANT EXECUTE ON FUNCTION public.current_admin_id() TO anon, authenticated;