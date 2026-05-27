
-- Pkg-fix: Manual Topup history + Transfer History admin reads silently empty
-- Root cause: admin_logs + agency_earnings_transfers have RLS policies (admin/owner/host)
-- but ZERO table-level GRANT to anon/authenticated. PostgREST returns "permission denied"
-- (silently swallowed by frontend) so AdminManualTopup + AdminTopupSystem + AdminTransferHistory
-- always show empty.
-- Same Pkg380 class of regression. Policies still gate access; we only add the missing grants.

GRANT SELECT, INSERT ON public.admin_logs TO anon, authenticated;
GRANT ALL ON public.admin_logs TO service_role;

GRANT SELECT, INSERT, UPDATE ON public.agency_earnings_transfers TO authenticated;
GRANT SELECT ON public.agency_earnings_transfers TO anon;
GRANT ALL ON public.agency_earnings_transfers TO service_role;
