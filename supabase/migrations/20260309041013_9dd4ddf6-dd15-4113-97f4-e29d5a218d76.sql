INSERT INTO app_settings (setting_key, setting_value, category, description)
VALUES 
  ('tencent_beauty_app_id', '"1408377570"', 'tencent_beauty', 'Tencent RTC Beauty App ID'),
  ('tencent_beauty_license_key', '"92b8ed44654461d46188e00a8e280e8a"', 'tencent_beauty', 'Tencent RTC Beauty License Key'),
  ('tencent_beauty_token', '"8fdd63e4c07e3ddde2ebc59a850167da"', 'tencent_beauty', 'Tencent RTC Beauty Token'),
  ('tencent_beauty_enabled', 'true', 'tencent_beauty', 'Tencent Beauty SDK enabled status')
ON CONFLICT (setting_key) DO NOTHING;