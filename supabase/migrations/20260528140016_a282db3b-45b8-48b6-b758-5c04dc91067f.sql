-- Dedupe any existing rows with same setting_key, keep newest
DELETE FROM public.branding_settings a
USING public.branding_settings b
WHERE a.setting_key = b.setting_key
  AND a.ctid < b.ctid;

CREATE UNIQUE INDEX IF NOT EXISTS branding_settings_setting_key_key
  ON public.branding_settings (setting_key);