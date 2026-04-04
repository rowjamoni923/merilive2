-- Fix gift_commission settings to have consistent values
UPDATE app_settings 
SET setting_value = jsonb_build_object(
  'host_percent', 60,
  'company_percent', 40,
  'description', 'Company takes 40%, Host receives 60%'
)
WHERE setting_key = 'gift_commission';