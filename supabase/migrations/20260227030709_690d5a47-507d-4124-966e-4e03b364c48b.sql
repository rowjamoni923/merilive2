
-- Insert essential exchange rate settings into app_settings
INSERT INTO app_settings (setting_key, setting_value, category, description)
VALUES 
  ('beans_per_dollar', '9000', 'exchange', '1 USD = 9000 beans'),
  ('host_percent', '55', 'commission', 'Host receives 55% of gift coins as beans')
ON CONFLICT (setting_key) DO UPDATE SET 
  setting_value = EXCLUDED.setting_value, 
  updated_at = now();
