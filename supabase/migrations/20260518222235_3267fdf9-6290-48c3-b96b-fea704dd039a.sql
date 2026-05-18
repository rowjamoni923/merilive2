INSERT INTO public.app_settings (setting_key, setting_value, description)
VALUES (
  'auto_withdrawal_fee',
  '{"flat_usd": 2, "enabled": true, "methods": ["epay", "usdt", "binance", "crypto_auto"]}'::jsonb::text,
  'Flat USD fee for Auto Withdrawal methods (ePay, USDT, Binance, Crypto Gateway) used by foreign agencies'
)
ON CONFLICT (setting_key) DO NOTHING;