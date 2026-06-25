CREATE OR REPLACE FUNCTION public.admin_search_closed_agencies(_search text DEFAULT NULL::text)
 RETURNS TABLE(id uuid, name text, agency_code text, owner_id uuid, owner_display_name text, owner_app_uid text, owner_avatar_url text, created_at timestamp with time zone, closed_at timestamp with time zone, closed_reason text, activation_deadline timestamp with time zone, active_host_count integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_admin_id uuid;
BEGIN
  v_admin_id := public.current_admin_id_from_header();

  IF v_admin_id IS NULL
     AND COALESCE(auth.role(), '') <> 'service_role'
     AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Admin only';
  END IF;

  RETURN QUERY
  SELECT a.id, a.name, a.agency_code, a.owner_id,
         p.display_name::text, p.app_uid::text, p.avatar_url::text,
         a.created_at, a.closed_at,
         COALESCE(a.closed_reason, a.blocked_reason)::text AS closed_reason,
         a.activation_deadline, a.active_host_count
    FROM public.agencies a
    LEFT JOIN public.profiles p ON p.id = a.owner_id
   WHERE a.activation_status = 'closed'
     AND COALESCE(a.is_official, false) = false
     AND (
       _search IS NULL OR _search = '' OR
       a.name ILIKE '%' || _search || '%' OR
       a.agency_code ILIKE '%' || _search || '%' OR
       p.display_name ILIKE '%' || _search || '%' OR
       p.app_uid ILIKE '%' || _search || '%'
     )
   ORDER BY a.closed_at DESC NULLS LAST, a.updated_at DESC
   LIMIT 200;
END;
$function$;