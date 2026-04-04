-- Fix missing GRANT permissions for agency-related tables
-- These are required for RLS policies to work

-- agencies table
GRANT SELECT, INSERT, UPDATE ON public.agencies TO authenticated;
GRANT SELECT ON public.agencies TO anon;

-- agency_hosts table
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agency_hosts TO authenticated;

-- agency_commission_history
GRANT SELECT, INSERT ON public.agency_commission_history TO authenticated;

-- agency_diamond_transactions
GRANT SELECT, INSERT ON public.agency_diamond_transactions TO authenticated;

-- agency_earnings_transfers
GRANT SELECT, INSERT ON public.agency_earnings_transfers TO authenticated;

-- agency_performance
GRANT SELECT ON public.agency_performance TO authenticated;

-- agency_withdrawals
GRANT SELECT, INSERT, UPDATE ON public.agency_withdrawals TO authenticated;

-- agency_level_tiers
GRANT SELECT ON public.agency_level_tiers TO authenticated;
GRANT SELECT ON public.agency_level_tiers TO anon;

-- agency_rankings
GRANT SELECT ON public.agency_rankings TO authenticated;

-- agency_policy_settings
GRANT SELECT ON public.agency_policy_settings TO authenticated;
GRANT SELECT ON public.agency_policy_settings TO anon;