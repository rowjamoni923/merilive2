-- Update or insert the crypto minimum deposit setting to 0.50 USD
INSERT INTO public.app_settings (setting_key, setting_value, updated_at)
VALUES ('swift_pay_crypto_min_usd', '0.50', now())
ON CONFLICT (setting_key) 
DO UPDATE SET 
    setting_value = EXCLUDED.setting_value,
    updated_at = now();

-- Ensure service_role can read this
GRANT ALL ON public.app_settings TO service_role;
