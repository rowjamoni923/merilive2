INSERT INTO public.admin_sections (section_key, section_name, section_name_bn, hub_key, icon_name, display_order, is_active)
SELECT 'gift-animation-config', 'Gift Animation Config', 'গিফট অ্যানিমেশন কনফিগ', 'visual-hub', 'Sparkles', 42, true
WHERE NOT EXISTS (SELECT 1 FROM public.admin_sections WHERE section_key = 'gift-animation-config');

INSERT INTO public.app_settings (setting_key, setting_value, description)
SELECT 'gift_animation_config',
       '{"full_screen_threshold": 500, "full_screen_enabled": true}'::jsonb,
       'Global full-screen gift animation gating (web + Flutter). Threshold = per-unit coin value.'
WHERE NOT EXISTS (SELECT 1 FROM public.app_settings WHERE setting_key = 'gift_animation_config');