CREATE OR REPLACE FUNCTION public.admin_list_pending_devices(_owner_admin_id uuid)
 RETURNS TABLE(id uuid, admin_user_id uuid, admin_email text, admin_display_name text, admin_role text, device_fingerprint text, device_name text, device_info jsonb, ip_address text, user_agent text, status text, requested_at timestamp with time zone, approved_at timestamp with time zone, rejected_at timestamp with time zone, last_used_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
DECLARE
  v_caller_admin_id uuid := public.current_admin_id_from_header();
  v_is_owner boolean := false;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.admin_users au
    WHERE au.id = v_caller_admin_id AND au.is_active = true AND au.role = 'owner'
  ) INTO v_is_owner;

  IF NOT public.is_active_admin_session() OR v_caller_admin_id IS NULL OR v_caller_admin_id <> _owner_admin_id OR NOT v_is_owner THEN
    RAISE EXCEPTION 'Access denied: owner only';
  END IF;

  RETURN QUERY
  SELECT
    d.id,
    d.admin_user_id,
    au.email,
    au.display_name,
    au.role::text,
    d.device_fingerprint,
    d.device_name,
    d.device_info,
    d.ip_address::text,
    d.user_agent,
    d.status::text,
    d.requested_at,
    d.approved_at,
    d.rejected_at,
    d.last_used_at
  FROM public.admin_allowed_devices d
  JOIN public.admin_users au ON au.id = d.admin_user_id
  ORDER BY CASE d.status::text WHEN 'pending' THEN 1 WHEN 'approved' THEN 2 ELSE 3 END,
           d.requested_at DESC NULLS LAST;
END;
$function$;