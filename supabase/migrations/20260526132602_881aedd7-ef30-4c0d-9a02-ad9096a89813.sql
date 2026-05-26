
-- 1) Lower crypto deposit floor to $1
UPDATE public.app_settings
SET setting_value = '{"min_usd": 1}'::text,
    updated_at = now()
WHERE setting_key = 'swift_pay_crypto_min_usd';

-- 2) Seed treasury external_user_id (idempotent)
INSERT INTO public.app_settings (setting_key, setting_value, description)
VALUES (
  'swift_pay_treasury_external_user_id',
  '"merilive_treasury"'::text,
  'SwiftPay external_user_id that holds pooled USDT and funds agency auto-withdrawals. Admin must keep this account funded on the SwiftPay dashboard.'
)
ON CONFLICT (setting_key) DO NOTHING;
