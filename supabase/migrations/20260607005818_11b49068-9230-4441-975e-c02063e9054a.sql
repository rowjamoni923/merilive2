-- Phase 5 Round 1: defense-in-depth REVOKE anon on admin withdrawal/payout RPCs
-- All have internal admin gates; this shrinks attack surface.

REVOKE EXECUTE ON FUNCTION public.admin_process_helper_withdrawal_request(uuid, text, bigint, text) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_process_withdrawal(uuid, text, text) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_promote_agency_owner_to_payroll_helper(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.approve_agency_withdrawal(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.assign_payroll_to_trader(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_list_helper_topup_requests(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_list_helper_upgrade_requests(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_payroll_orders_stats() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_withdrawal_stats() FROM anon, PUBLIC;

-- authenticated keeps EXECUTE (internal admin gate filters); service_role unchanged.