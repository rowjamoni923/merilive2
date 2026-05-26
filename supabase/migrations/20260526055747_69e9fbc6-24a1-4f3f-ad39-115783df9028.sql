UPDATE public.app_settings
SET setting_value = jsonb_build_object(
  'beans_to_diamonds_rate', 4,
  'exchange_fee_percent', 0,
  'min_exchange_amount', 100000
),
updated_at = now()
WHERE setting_key = 'coin_exchange';