UPDATE agency_policy_settings 
SET content = jsonb_set(
  content::jsonb, 
  '{payment_methods}', 
  '[{"name": "Local Payment", "type": "Local Currency"}, {"name": "USDT", "type": "Crypto"}, {"name": "ePay", "type": "Digital Payment"}]'::jsonb
),
updated_at = now()
WHERE section_key = 'withdrawal';