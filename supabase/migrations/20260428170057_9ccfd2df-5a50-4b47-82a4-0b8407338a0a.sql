
CREATE OR REPLACE FUNCTION public.admin_list_chat_bubbles_all()
RETURNS SETOF public.level_privileges
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_active_admin_session() THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;
  RETURN QUERY
    SELECT * FROM public.level_privileges
    WHERE privilege_type = 'chat_bubble'
    ORDER BY unlock_level NULLS LAST, created_at DESC;
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_list_chat_bubbles_all() TO authenticated, anon;
