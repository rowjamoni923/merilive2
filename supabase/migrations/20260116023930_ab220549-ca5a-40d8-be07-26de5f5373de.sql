-- Insert default coin exchange settings
INSERT INTO app_settings (setting_key, setting_value, category, description)
VALUES (
  'coin_exchange',
  '{"beans_to_diamonds_rate": 100, "exchange_fee_percent": 5, "min_exchange_amount": 1000}'::jsonb,
  'commission',
  'Agency beans to diamonds exchange settings'
)
ON CONFLICT (setting_key) DO UPDATE SET
  setting_value = EXCLUDED.setting_value,
  updated_at = now();