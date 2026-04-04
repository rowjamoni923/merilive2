-- Allow anonymous users to read branding_settings (public data, no sensitive info)
CREATE POLICY "Anyone can read branding settings"
ON public.branding_settings
FOR SELECT
USING (true);
