
-- Sync host_percent standalone setting to match gift_commission (50%)
UPDATE app_settings SET setting_value = '50'::jsonb, updated_at = now() WHERE setting_key = 'host_percent';

-- Sync call_pricing host_commission_percent to match call_rates (50%)
UPDATE app_settings 
SET setting_value = jsonb_set(jsonb_set(setting_value, '{host_commission_percent}', '50'), '{company_commission_percent}', '50'),
    updated_at = now() 
WHERE setting_key = 'call_pricing';
