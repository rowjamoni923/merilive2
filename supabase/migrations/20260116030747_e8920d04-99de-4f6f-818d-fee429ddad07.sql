-- Update coin exchange settings: 50 beans = 1 diamond
UPDATE app_settings 
SET setting_value = '{"beans_to_diamonds_rate": 50, "exchange_fee_percent": 5, "min_exchange_amount": 1000}'::jsonb,
    updated_at = now()
WHERE setting_key = 'coin_exchange';