INSERT INTO app_settings (setting_key, setting_value, category, description)
VALUES ('play_store_downloads', '"10,000+"', 'landing_page', 'Play Store download count displayed on landing page. Update this value to reflect actual downloads.')
ON CONFLICT (setting_key) DO NOTHING;