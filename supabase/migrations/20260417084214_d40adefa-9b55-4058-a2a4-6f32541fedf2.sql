-- Fix Profile/Notice crash: get_user_notices had type mismatch
-- admin_notices.read_by is uuid[] but function used text[] cast → 42846 error
CREATE OR REPLACE FUNCTION public.get_user_notices(p_user_id uuid)
 RETURNS TABLE(id uuid, title text, message text, priority text, image_url text, created_at timestamp with time zone, is_read boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT n.id, n.title, n.message, n.priority, n.image_url, n.created_at,
    (p_user_id = ANY(COALESCE(n.read_by, ARRAY[]::uuid[]))) AS is_read
  FROM admin_notices n
  WHERE n.is_active = true AND (n.expires_at IS NULL OR n.expires_at > now())
  ORDER BY n.created_at DESC LIMIT 50;
END;
$function$;