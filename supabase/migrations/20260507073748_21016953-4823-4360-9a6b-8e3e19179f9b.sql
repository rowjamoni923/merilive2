INSERT INTO public.payment_gateways (name, gateway_type, country_codes, is_integrated, is_active, display_order)
SELECT * FROM (VALUES
  ('ZiniPay',     'zinipay',     ARRAY['BD'], true, true, 1),
  ('SSLCommerz',  'sslcommerz',  ARRAY['BD'], true, true, 2),
  ('AamarPay',    'aamarpay',    ARRAY['BD'], true, true, 3),
  ('UddoktaPay',  'uddoktapay',  ARRAY['BD'], true, true, 4)
) AS v(name, gateway_type, country_codes, is_integrated, is_active, display_order)
WHERE NOT EXISTS (
  SELECT 1 FROM public.payment_gateways pg WHERE pg.gateway_type = v.gateway_type
);

UPDATE public.payment_gateways
SET country_codes = ARRAY['BD'],
    is_integrated = true,
    is_active     = true
WHERE gateway_type IN ('zinipay','sslcommerz','aamarpay','uddoktapay');