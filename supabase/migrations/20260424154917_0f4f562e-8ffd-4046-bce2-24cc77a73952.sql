CREATE OR REPLACE FUNCTION public.admin_list_pending_devices(_owner_admin_id uuid)
 RETURNS TABLE(id uuid, admin_user_id uuid, admin_email text, admin_display_name text, admin_role text, device_fingerprint text, device_name text, device_info jsonb, ip_address text, user_agent text, status text, requested_at timestamp with time zone, approved_at timestamp with time zone, rejected_at timestamp with time zone, last_used_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_owner_role text;
BEGIN
  SELECT au.role INTO v_owner_role
  FROM public.admin_users au
  WHERE au.id = _owner_admin_id AND au.is_active = true AND au.role = 'owner'
  LIMIT 1;

  IF v_owner_role IS NULL THEN
    RAISE EXCEPTION 'Access denied: owner only';
  END IF;

  RETURN QUERY
  SELECT
    x.d_id,
    x.d_admin_user_id,
    x.au_email,
    x.au_display_name,
    x.au_role,
    x.d_device_fingerprint,
    x.d_device_name,
    x.d_device_info,
    x.d_ip_address,
    x.d_user_agent,
    x.d_status,
    x.d_requested_at,
    x.d_approved_at,
    x.d_rejected_at,
    x.d_last_used_at
  FROM (
    SELECT
      d.id            AS d_id,
      d.admin_user_id AS d_admin_user_id,
      au.email        AS au_email,
      au.display_name AS au_display_name,
      au.role::text   AS au_role,
      d.device_fingerprint AS d_device_fingerprint,
      d.device_name        AS d_device_name,
      d.device_info        AS d_device_info,
      d.ip_address::text   AS d_ip_address,
      d.user_agent         AS d_user_agent,
      d.status::text       AS d_status,
      d.requested_at       AS d_requested_at,
      d.approved_at        AS d_approved_at,
      d.rejected_at        AS d_rejected_at,
      d.last_used_at       AS d_last_used_at,
      CASE d.status::text
        WHEN 'pending' THEN 1
        WHEN 'approved' THEN 2
        ELSE 3
      END AS sort_status
    FROM public.admin_allowed_devices d
    JOIN public.admin_users au ON au.id = d.admin_user_id
  ) x
  ORDER BY x.sort_status, x.d_requested_at DESC NULLS LAST;
END;
$function$;