-- Allow admin panel (custom session via x-admin-token) to call moderation RPCs.
-- Keep backward compatibility with auth.uid()-based admin checks.

CREATE OR REPLACE FUNCTION public.admin_list_blocked_users(_search text DEFAULT NULL::text, _limit integer DEFAULT 200)
 RETURNS TABLE(id uuid, display_name text, avatar_url text, blocked_at timestamp with time zone, blocked_reason text, is_host boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT (public.is_admin(auth.uid()) OR public.is_active_admin_session()) THEN
    RAISE EXCEPTION 'Access denied: admin only';
  END IF;

  RETURN QUERY
  SELECT p.id, p.display_name, p.avatar_url,
         p.blocked_at, p.blocked_reason, p.is_host
  FROM public.profiles p
  WHERE p.is_blocked = true
    AND (_search IS NULL OR _search = ''
         OR p.display_name ILIKE '%' || _search || '%'
         OR p.app_uid ILIKE '%' || _search || '%')
  ORDER BY p.blocked_at DESC NULLS LAST
  LIMIT _limit;
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_list_blocked_agencies(_search text DEFAULT NULL::text, _limit integer DEFAULT 200)
 RETURNS TABLE(id uuid, name text, agency_code text, blocked_at timestamp with time zone, blocked_reason text, total_hosts integer, owner_id uuid, owner_display_name text, owner_avatar_url text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT (public.is_admin(auth.uid()) OR public.is_active_admin_session()) THEN
    RAISE EXCEPTION 'Access denied: admin only';
  END IF;

  RETURN QUERY
  SELECT a.id, a.name, a.agency_code,
         a.blocked_at, a.blocked_reason, COALESCE(a.total_hosts, 0)::int,
         a.owner_id, p.display_name, p.avatar_url
  FROM public.agencies a
  LEFT JOIN public.profiles p ON p.id = a.owner_id
  WHERE a.is_blocked = true
    AND (_search IS NULL OR _search = ''
         OR a.name ILIKE '%' || _search || '%'
         OR a.agency_code ILIKE '%' || _search || '%')
  ORDER BY a.blocked_at DESC NULLS LAST
  LIMIT _limit;
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_list_live_bans(_only_active boolean DEFAULT true, _limit integer DEFAULT 200)
 RETURNS TABLE(id uuid, user_id uuid, ban_reason text, violation_type text, warning_count integer, ban_start timestamp with time zone, ban_end timestamp with time zone, ban_duration_hours integer, is_active boolean, auto_banned boolean, unbanned_by uuid, unbanned_at timestamp with time zone, display_name text, avatar_url text, app_uid text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT (public.is_admin(auth.uid()) OR public.is_active_admin_session()) THEN
    RAISE EXCEPTION 'Access denied: admin only';
  END IF;

  RETURN QUERY
  SELECT lb.id, lb.user_id, lb.ban_reason, lb.violation_type,
         lb.warning_count, lb.ban_start, lb.ban_end, lb.ban_duration_hours,
         lb.is_active, lb.auto_banned, lb.unbanned_by, lb.unbanned_at,
         p.display_name, p.avatar_url, p.app_uid
  FROM public.live_bans lb
  LEFT JOIN public.profiles p ON p.id = lb.user_id
  WHERE (NOT _only_active OR lb.is_active = true)
  ORDER BY lb.ban_start DESC NULLS LAST
  LIMIT _limit;
END;
$function$;

-- admin_block_user: relied on auth.uid() for admin id; now fall back to header session
CREATE OR REPLACE FUNCTION public.admin_block_user(_user_id uuid, _block boolean, _reason text DEFAULT NULL::text, _ban_device boolean DEFAULT false)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    _user_ip TEXT;
    _device_id TEXT;
    _admin_id UUID;
BEGIN
    _admin_id := COALESCE(auth.uid(), public.current_admin_id_from_header());

    IF _admin_id IS NULL OR NOT (public.is_admin(_admin_id) OR public.is_active_admin_session()) THEN
      RAISE EXCEPTION 'Access denied: admin only';
    END IF;

    UPDATE public.profiles
    SET is_blocked = _block,
        blocked_reason = CASE WHEN _block THEN _reason ELSE NULL END,
        blocked_at = CASE WHEN _block THEN now() ELSE NULL END
    WHERE id = _user_id;

    IF _block AND _ban_device THEN
        SELECT last_login_ip, device_id INTO _user_ip, _device_id FROM public.profiles WHERE id = _user_id;

        IF _user_ip IS NOT NULL AND _user_ip <> '' THEN
            INSERT INTO public.banned_ips (ip_address, user_id, reason, banned_by)
            VALUES (_user_ip, _user_id, COALESCE(_reason, 'Banned by admin'), _admin_id)
            ON CONFLICT (ip_address) DO UPDATE SET is_active = true, updated_at = now();
        END IF;

        IF _device_id IS NOT NULL THEN
            INSERT INTO public.banned_devices (device_id, user_id, reason, banned_by)
            VALUES (_device_id, _user_id, COALESCE(_reason, 'Banned by admin'), _admin_id)
            ON CONFLICT (device_id) DO UPDATE SET is_active = true, updated_at = now();
        END IF;
    END IF;

    IF _block THEN
        UPDATE public.live_streams SET is_active = false, ended_at = now()
        WHERE host_id = _user_id AND is_active = true;
    END IF;
END;
$function$;

-- Patch any other admin_* RPCs that gate on is_admin(auth.uid()) to also accept admin session header.
-- Generic helper for use going forward
CREATE OR REPLACE FUNCTION public.is_admin_request()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT public.is_admin(auth.uid()) OR public.is_active_admin_session();
$$;