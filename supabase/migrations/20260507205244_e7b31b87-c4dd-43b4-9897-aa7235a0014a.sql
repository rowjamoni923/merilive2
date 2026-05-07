-- Strip anon explicitly from every Section 4–17 RPC.
REVOKE EXECUTE ON FUNCTION public.leave_agency() FROM anon;
REVOKE EXECUTE ON FUNCTION public.create_agency_with_owner(text, text, text, text, text, jsonb, text) FROM anon;

REVOKE EXECUTE ON FUNCTION public.admin_agency_overview_stats() FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_agency_overview_stats(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.agency_dashboard_charts(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.agency_dashboard_list_hosts(uuid, text, int, int) FROM anon;

REVOKE EXECUTE ON FUNCTION public.get_task_reset_date() FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_task_week_reset_date() FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_task_center_calendar() FROM anon;
REVOKE EXECUTE ON FUNCTION public.has_unclaimed_task_reward(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.update_task_progress(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.update_task_progress(text, integer, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.claim_task_reward(uuid, uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.claim_daily_task_reward(uuid, uuid, text) FROM anon;

REVOKE EXECUTE ON FUNCTION public.update_avatar(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.update_profile(jsonb) FROM anon;

REVOKE EXECUTE ON FUNCTION public.purchase_shop_item(text, uuid, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.set_user_offline(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.update_host_call_rate(integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.profile_follow_stats(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.helper_transfer_diamonds_to_self(uuid, bigint) FROM anon;