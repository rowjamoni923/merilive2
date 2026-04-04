-- Allow ALL hosts to set custom call rates (no level restriction)
-- Update min_level_for_custom_rate to 1
UPDATE app_settings 
SET setting_value = jsonb_set(
  setting_value, 
  '{min_level_for_custom_rate}', 
  '1'::jsonb
)
WHERE setting_key = 'call_rates';