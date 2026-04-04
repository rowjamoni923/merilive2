-- Insert beans_to_usd_rate setting with default value 10000 (10,000 beans = $1)
INSERT INTO public.app_settings (setting_key, setting_value, category, description)
VALUES (
  'beans_to_usd_rate',
  '{"rate": 10000}'::jsonb,
  'exchange',
  'Beans to USD exchange rate for agency withdrawals'
)
ON CONFLICT (setting_key) DO UPDATE SET
  setting_value = EXCLUDED.setting_value,
  updated_at = now();