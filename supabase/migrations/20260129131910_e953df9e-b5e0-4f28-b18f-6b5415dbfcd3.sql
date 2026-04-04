
-- Fix beans to USD rate: 9,000 beans = $1 USD (matching agency_commission settings)
UPDATE app_settings 
SET setting_value = '{"rate": 9000}'::jsonb,
    updated_at = now()
WHERE setting_key = 'beans_to_usd_rate';
