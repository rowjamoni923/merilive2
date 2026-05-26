-- Pkg368: Keep app branding logo on public storage, never private/signed.

-- 1) Force the public branding/app-assets buckets to stay public and image-friendly.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('branding', 'branding', true, 52428800, ARRAY['image/png','image/jpeg','image/jpg','image/webp','image/gif','image/avif','image/bmp','image/svg+xml','video/mp4','video/webm','video/quicktime','video/x-m4v']),
  ('app-assets', 'app-assets', true, 52428800, ARRAY['image/png','image/jpeg','image/jpg','image/webp','image/gif','image/avif','image/bmp','image/svg+xml','image/apng','video/mp4','video/webm','video/quicktime','video/x-m4v','application/json'])
ON CONFLICT (id) DO UPDATE
SET public = true,
    file_size_limit = GREATEST(COALESCE(storage.buckets.file_size_limit, 0), EXCLUDED.file_size_limit),
    allowed_mime_types = EXCLUDED.allowed_mime_types;

-- 2) Ensure anonymous/public read of logo assets from the public buckets.
DROP POLICY IF EXISTS "Pkg368 public read branding assets" ON storage.objects;
CREATE POLICY "Pkg368 public read branding assets"
ON storage.objects
FOR SELECT
TO anon, authenticated
USING (bucket_id = 'branding');

DROP POLICY IF EXISTS "Pkg368 public read app-assets" ON storage.objects;
CREATE POLICY "Pkg368 public read app-assets"
ON storage.objects
FOR SELECT
TO anon, authenticated
USING (bucket_id = 'app-assets');

-- 3) Repair the default branding JSON if logo is missing/private/signed.
DO $$
DECLARE
  v_public_logo text := 'https://ayjdlvuurscxucatbbah.supabase.co/storage/v1/object/public/app-assets/merilive-logo.png';
  v_existing jsonb;
BEGIN
  SELECT COALESCE(setting_value::jsonb, '{}'::jsonb)
    INTO v_existing
  FROM public.branding_settings
  WHERE setting_key = 'default'
  LIMIT 1;

  v_existing := COALESCE(v_existing, '{}'::jsonb);

  IF NOT EXISTS (SELECT 1 FROM public.branding_settings WHERE setting_key = 'default') THEN
    INSERT INTO public.branding_settings (setting_key, setting_value, description, updated_at)
    VALUES (
      'default',
      jsonb_build_object(
        'logo_text_primary', '',
        'logo_text_secondary', '',
        'tagline', '',
        'background_type', 'gradient',
        'background_url', '',
        'logo_image_url', v_public_logo,
        'logo_url', v_public_logo,
        'app_name', ''
      )::text,
      'Default branding settings',
      now()
    );
  ELSE
    IF COALESCE(v_existing->>'logo_image_url', v_existing->>'logo_url', '') = ''
       OR COALESCE(v_existing->>'logo_image_url', v_existing->>'logo_url', '') ILIKE '%/object/sign/%'
       OR COALESCE(v_existing->>'logo_image_url', v_existing->>'logo_url', '') ILIKE '%token=%'
       OR COALESCE(v_existing->>'logo_image_url', v_existing->>'logo_url', '') ILIKE '%private%'
    THEN
      UPDATE public.branding_settings
      SET setting_value = (
            v_existing
            || jsonb_build_object('logo_image_url', v_public_logo, 'logo_url', v_public_logo)
          )::text,
          updated_at = now()
      WHERE setting_key = 'default';
    END IF;
  END IF;
END $$;