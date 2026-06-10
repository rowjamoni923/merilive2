CREATE OR REPLACE FUNCTION public.sync_host_online_status(p_user_id uuid, p_is_online boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_target_availability text := CASE WHEN p_is_online THEN 'online' ELSE 'offline' END;
BEGIN
  UPDATE public.profiles
  SET is_online = p_is_online,
      host_availability = CASE WHEN is_host THEN v_target_availability ELSE host_availability END,
      last_seen_at = now()
  WHERE id = p_user_id
    AND (
      COALESCE(is_online, false) IS DISTINCT FROM p_is_online
      OR last_seen_at IS NULL
      OR last_seen_at < (now() - interval '5 minutes')
      OR (is_host AND COALESCE(host_availability, 'offline') IS DISTINCT FROM v_target_availability)
    );
END;
$function$;