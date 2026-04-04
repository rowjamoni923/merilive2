-- Re-grant table-level permissions for anon and authenticated roles
-- These are needed for RLS policies to work

-- Tables that need read access for both anon and authenticated
GRANT SELECT ON public.game_settings TO anon, authenticated;
GRANT SELECT ON public.gifts TO anon, authenticated;
GRANT SELECT ON public.banners TO anon, authenticated;
GRANT SELECT ON public.coin_packages TO anon, authenticated;
GRANT SELECT ON public.currency_rates TO anon, authenticated;
GRANT SELECT ON public.topup_payment_methods TO anon, authenticated;
GRANT SELECT ON public.branding_settings TO anon, authenticated;
GRANT SELECT ON public.app_settings TO anon, authenticated;
GRANT SELECT ON public.app_content TO anon, authenticated;

-- Tables that need INSERT for error logging
GRANT SELECT, INSERT ON public.system_error_logs TO anon, authenticated;

-- Admin-managed tables need full access for authenticated (RLS handles restrictions)
GRANT INSERT, UPDATE, DELETE ON public.game_settings TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.gifts TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.banners TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.coin_packages TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.currency_rates TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.topup_payment_methods TO authenticated;
GRANT UPDATE, DELETE ON public.system_error_logs TO authenticated;

-- Core user tables
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT SELECT ON public.profiles TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT SELECT, INSERT ON public.device_tokens TO authenticated;
GRANT UPDATE ON public.device_tokens TO authenticated;

-- Agency tables
GRANT SELECT, INSERT, UPDATE ON public.agencies TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agency_hosts TO authenticated;
GRANT SELECT ON public.agency_level_tiers TO anon, authenticated;
GRANT SELECT ON public.agency_rankings TO authenticated;
GRANT SELECT ON public.agency_performance TO authenticated;
GRANT SELECT, INSERT ON public.agency_commission_history TO authenticated;
GRANT SELECT, INSERT ON public.agency_earnings_transfers TO authenticated;
GRANT SELECT, INSERT ON public.agency_diamond_transactions TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.agency_withdrawals TO authenticated;
GRANT SELECT ON public.agency_policy_settings TO anon, authenticated;

-- Gift & transaction tables
GRANT SELECT, INSERT ON public.gift_transactions TO authenticated;
GRANT SELECT, INSERT ON public.coin_transfers TO authenticated;

-- Call tables
GRANT SELECT, INSERT, UPDATE ON public.private_calls TO authenticated;
GRANT SELECT, INSERT ON public.call_events TO authenticated;

-- Chat tables
GRANT SELECT, INSERT, UPDATE ON public.conversations TO authenticated;

-- Other feature tables
GRANT SELECT ON public.categories TO anon, authenticated;
GRANT SELECT ON public.channels TO anon, authenticated;
GRANT SELECT ON public.daily_tasks TO authenticated;
GRANT SELECT ON public.avatar_frames TO authenticated;
GRANT SELECT ON public.entertainment TO anon, authenticated;
GRANT SELECT ON public.admin_notices TO authenticated;
GRANT SELECT ON public.admin_music_library TO authenticated;
GRANT SELECT ON public.allowed_external_links TO authenticated;
GRANT SELECT ON public.app_version_settings TO anon, authenticated;

-- Blocked/banned tables
GRANT SELECT ON public.banned_devices TO authenticated;
GRANT SELECT ON public.blocked_ips TO authenticated;
GRANT SELECT ON public.account_lockouts TO authenticated;