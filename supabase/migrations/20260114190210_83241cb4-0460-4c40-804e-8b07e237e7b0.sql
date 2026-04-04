-- Insert default commission settings if not exists
INSERT INTO app_settings (setting_key, setting_value, category, description)
VALUES (
  'gift_commission',
  '{"company_percent": 40, "host_percent": 60, "description": "Company takes 40%, Host receives 60%"}'::jsonb,
  'commission',
  'Gift commission distribution settings'
)
ON CONFLICT (setting_key) DO UPDATE SET
  setting_value = EXCLUDED.setting_value,
  updated_at = now();