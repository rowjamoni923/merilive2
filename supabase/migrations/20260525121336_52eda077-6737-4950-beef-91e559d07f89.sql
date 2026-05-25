-- Pkg338 final verification hardening: remove anonymous direct execution from financial trigger/helper functions.

REVOKE EXECUTE ON FUNCTION public.admin_save_host_bonus_settings(integer, integer, integer, integer, integer, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_save_host_bonus_settings(integer, integer, integer, integer, integer, boolean) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_my_host_bonus_ledger(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_host_bonus_ledger(integer) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.add_to_weekly_earnings() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.auto_level_on_recharge() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.grant_welcome_bonus() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.guard_agency_withdrawals_update() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.notify_agency_withdrawal_status() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.notify_coin_transfer() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.notify_diamond_exchange() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.notify_helpers_on_agency_withdrawal() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.notify_on_recharge_completed() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.notify_on_withdrawal_status() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.notify_payroll_helpers_on_agency_withdrawal() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.prevent_helper_wallet_manipulation() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.tg_app_sync_agency_earnings_transfers() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.tg_app_sync_agency_withdrawals() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.tg_app_sync_coin_transfers() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.tg_app_sync_helper_withdrawal_requests() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.trg_reset_host_policy_on_withdrawal_complete() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.trg_reset_host_weekly_on_withdrawal() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.trigger_admin_notify_withdrawal() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.trigger_apply_recharge_bonus() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.update_agency_level_on_earnings() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.update_consumption_on_recharge() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.update_host_call_earnings() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.update_host_earnings_on_gift() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.update_host_level_on_earnings() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.update_total_recharged() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.validate_recharge_campaign() FROM PUBLIC, anon;