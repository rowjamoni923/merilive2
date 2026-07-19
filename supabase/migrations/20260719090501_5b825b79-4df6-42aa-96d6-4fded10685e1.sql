UPDATE public.app_settings
SET setting_value = replace(setting_value, '"coins_to_dollar_rate"', '"beans_to_dollar_rate"'),
    updated_at = now()
WHERE setting_key IN ('withdrawal_settings', 'agency_commission')
  AND setting_value ILIKE '%coins_to_dollar_rate%';