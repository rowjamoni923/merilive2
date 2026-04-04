-- Update exchange rate to use Beans instead of BDT
UPDATE public.agency_policy_settings 
SET content = '{"rate": 9000, "currency": "Beans", "display": "9,000 Beans = $1 USD"}'::jsonb,
    updated_at = now()
WHERE section_key = 'exchange_rate';