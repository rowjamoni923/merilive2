-- Fix: max_rate was set to 500 which was clamping custom rates
-- Update max_rate to 10000 so hosts can set higher rates
UPDATE app_settings 
SET setting_value = jsonb_set(
  setting_value, 
  '{max_rate}', 
  '10000'::jsonb
)
WHERE setting_key = 'call_rates';