REVOKE EXECUTE ON FUNCTION public.record_host_live_bonus_elapsed(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.record_active_host_live_bonus_minutes() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_host_live_bonus_elapsed(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_active_host_live_bonus_minutes() TO service_role;
GRANT EXECUTE ON FUNCTION public.record_host_live_minute(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_host_live_bonus_state(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_host_live_hour_bonus(uuid, integer) TO authenticated;