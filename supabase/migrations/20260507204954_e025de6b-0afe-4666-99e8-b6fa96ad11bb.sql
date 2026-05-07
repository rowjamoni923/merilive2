-- 1) Revoke PUBLIC execute, regrant to authenticated only.
REVOKE ALL ON FUNCTION public.admin_agency_overview_stats(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_agency_overview_stats(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.agency_dashboard_charts(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.agency_dashboard_charts(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.agency_dashboard_list_hosts(uuid, text, int, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.agency_dashboard_list_hosts(uuid, text, int, int) TO authenticated;

REVOKE ALL ON FUNCTION public.get_task_center_calendar() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_task_center_calendar() TO authenticated;

REVOKE ALL ON FUNCTION public.has_unclaimed_task_reward(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_unclaimed_task_reward(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.update_task_progress(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_task_progress(text) TO authenticated;

REVOKE ALL ON FUNCTION public.update_task_progress(text, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_task_progress(text, integer, integer) TO authenticated;

REVOKE ALL ON FUNCTION public.claim_task_reward(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_task_reward(uuid, uuid, text) TO authenticated;

REVOKE ALL ON FUNCTION public.claim_daily_task_reward(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_daily_task_reward(uuid, uuid, text) TO authenticated;

-- Admin zero-arg variant: only admins via internal is_active_admin_session() check.
REVOKE ALL ON FUNCTION public.admin_agency_overview_stats() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_agency_overview_stats() TO authenticated;

-- 2) Lock search_path on task date helpers.
ALTER FUNCTION public.get_task_reset_date() SET search_path = public;
ALTER FUNCTION public.get_task_week_reset_date() SET search_path = public;