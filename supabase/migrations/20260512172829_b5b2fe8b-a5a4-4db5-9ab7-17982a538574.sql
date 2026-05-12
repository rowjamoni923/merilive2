UPDATE public.app_settings SET setting_value = 'true', updated_at = now() WHERE setting_key = 'allow_web_calls';
INSERT INTO public.app_settings (setting_key, setting_value)
SELECT 'allow_web_calls', 'true'
WHERE NOT EXISTS (SELECT 1 FROM public.app_settings WHERE setting_key = 'allow_web_calls');