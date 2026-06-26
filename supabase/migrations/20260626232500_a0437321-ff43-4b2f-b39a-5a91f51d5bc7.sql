CREATE OR REPLACE FUNCTION public.get_online_global_hosts(p_caller_id uuid, p_limit integer DEFAULT 500)
RETURNS TABLE(host_id uuid)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT p.id AS host_id
    FROM public.profiles p
    LEFT JOIN public.host_match_availability a ON a.host_id = p.id
    LEFT JOIN public.host_match_stats s ON s.host_id = p.id
   WHERE p.id <> p_caller_id
     AND COALESCE(p.is_host, false) = true
     AND COALESCE(p.is_face_verified, false) = true
     AND p.host_status = 'approved'
     AND COALESCE(p.is_online, false) = true
     AND COALESCE(p.last_seen_at, '-infinity'::timestamptz) >= now() - interval '30 minutes'
     AND lower(COALESCE(p.host_availability, 'online')) <> 'offline'
     AND COALESCE(a.is_available, true) = true
     AND (a.suspended_until IS NULL OR a.suspended_until < now())
     AND (a.match_suspend_until IS NULL OR a.match_suspend_until < now())
     AND (s.random_reject_cooldown_until IS NULL OR s.random_reject_cooldown_until < now())
     AND (s.is_queue_suppressed IS NULL OR s.is_queue_suppressed = false)
   ORDER BY COALESCE(a.last_active_at, p.last_seen_at, p.updated_at, p.created_at) DESC NULLS LAST, p.id ASC
   LIMIT GREATEST(1, LEAST(1000, p_limit));
$function$;

GRANT EXECUTE ON FUNCTION public.get_online_global_hosts(uuid, integer) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_random_pool_sample(_limit integer DEFAULT 6)
RETURNS TABLE(avatar_url text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT p.avatar_url
    FROM public.profiles p
    LEFT JOIN public.host_match_availability a ON a.host_id = p.id
    LEFT JOIN public.host_match_stats s ON s.host_id = p.id
   WHERE COALESCE(p.is_host, false) = true
     AND COALESCE(p.is_face_verified, false) = true
     AND p.host_status = 'approved'
     AND COALESCE(p.is_online, false) = true
     AND COALESCE(p.last_seen_at, '-infinity'::timestamptz) >= now() - interval '30 minutes'
     AND lower(COALESCE(p.host_availability, 'online')) <> 'offline'
     AND p.avatar_url IS NOT NULL
     AND COALESCE(a.is_available, true) = true
     AND (a.suspended_until IS NULL OR a.suspended_until < now())
     AND (a.match_suspend_until IS NULL OR a.match_suspend_until < now())
     AND (s.random_reject_cooldown_until IS NULL OR s.random_reject_cooldown_until < now())
     AND (s.is_queue_suppressed IS NULL OR s.is_queue_suppressed = false)
   ORDER BY COALESCE(a.last_active_at, p.last_seen_at, p.updated_at, p.created_at) DESC NULLS LAST, p.id ASC
   LIMIT GREATEST(1, LEAST(24, _limit));
$function$;

GRANT EXECUTE ON FUNCTION public.get_random_pool_sample(integer) TO anon, authenticated, service_role;