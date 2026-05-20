-- Pkg70: Admin-configurable top-up trader tier-min wallet thresholds
-- Default matches legacy hardcoded values so behavior is unchanged until admin edits.
INSERT INTO public.app_settings (setting_key, setting_value, description)
VALUES (
  'topup_trader_tier_min_wallet',
  jsonb_build_object('1', 50000, '2', 100000, '3', 150000, '4', 200000, '5', 300000),
  'Minimum trader wallet_balance (diamonds) per trader_level required to be visible in /recharge Verified Traders list. Edit via Admin → Pricing Hub → Helper tab. Frontend-only gate; DB gate is_approved_topup_trader is unchanged.'
)
ON CONFLICT (setting_key) DO NOTHING;