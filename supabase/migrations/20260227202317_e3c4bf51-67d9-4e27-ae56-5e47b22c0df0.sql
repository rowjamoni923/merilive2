-- Grant permissions for all agency-related tables

-- Agency hosts
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agency_hosts TO authenticated;
GRANT SELECT ON public.agency_hosts TO anon;

-- Agency earnings transfers
GRANT SELECT, INSERT ON public.agency_earnings_transfers TO authenticated;
GRANT SELECT ON public.agency_earnings_transfers TO anon;

-- Agency commission history
GRANT SELECT, INSERT ON public.agency_commission_history TO authenticated;

-- Agency diamond transactions
GRANT SELECT, INSERT ON public.agency_diamond_transactions TO authenticated;

-- Agency level tiers (read-only for users)
GRANT SELECT ON public.agency_level_tiers TO authenticated;
GRANT SELECT ON public.agency_level_tiers TO anon;

-- Agency performance
GRANT SELECT, INSERT, UPDATE ON public.agency_performance TO authenticated;

-- Agency policy settings (read-only for users)
GRANT SELECT ON public.agency_policy_settings TO authenticated;
GRANT SELECT ON public.agency_policy_settings TO anon;

-- Agency rankings
GRANT SELECT ON public.agency_rankings TO authenticated;
GRANT SELECT ON public.agency_rankings TO anon;

-- Agency withdrawals
GRANT SELECT, INSERT, UPDATE ON public.agency_withdrawals TO authenticated;

-- Sub agents
GRANT SELECT, INSERT, UPDATE ON public.sub_agents TO authenticated;

-- Topup helpers
GRANT SELECT, INSERT, UPDATE ON public.topup_helpers TO authenticated;

-- Helper orders (if exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'helper_orders') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE ON public.helper_orders TO authenticated';
  END IF;
END $$;

-- Profiles (critical)
GRANT SELECT, UPDATE ON public.profiles TO authenticated;
GRANT SELECT ON public.profiles TO anon;

-- Currency rates
GRANT SELECT ON public.currency_rates TO authenticated;
GRANT SELECT ON public.currency_rates TO anon;

-- App settings
GRANT SELECT ON public.app_settings TO authenticated;
GRANT SELECT ON public.app_settings TO anon;