-- Phase-3 C2: atomic sync of profiles.is_online + profiles.host_availability.
-- Eliminates drift between the two columns that used to diverge when
-- update_online_status only touched is_online.
CREATE OR REPLACE FUNCTION public.sync_host_online_status(
  p_user_id uuid,
  p_is_online boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles
  SET is_online = p_is_online,
      host_availability = CASE WHEN is_host THEN p_is_online ELSE host_availability END,
      last_seen_at = now()
  WHERE id = p_user_id
    AND (
      COALESCE(is_online, false) IS DISTINCT FROM p_is_online
      OR last_seen_at IS NULL
      OR last_seen_at < (now() - interval '5 minutes')
      OR (is_host AND COALESCE(host_availability, false) IS DISTINCT FROM p_is_online)
    );
END;
$$;

-- Grant so authenticated users can call it from the client (same roles as update_online_status)
GRANT EXECUTE ON FUNCTION public.sync_host_online_status(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sync_host_online_status(uuid, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.sync_host_online_status(uuid, boolean) TO anon;
