-- Create branding_settings table for login page customization
CREATE TABLE public.branding_settings (
  id TEXT PRIMARY KEY DEFAULT 'default',
  logo_text_primary TEXT DEFAULT 'meri',
  logo_text_secondary TEXT DEFAULT 'LIVE',
  tagline TEXT DEFAULT 'Connect • Chat • Share',
  background_type TEXT DEFAULT 'image' CHECK (background_type IN ('image', 'video')),
  background_url TEXT DEFAULT 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=800',
  logo_image_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Insert default row
INSERT INTO public.branding_settings (id) VALUES ('default');

-- Enable RLS
ALTER TABLE public.branding_settings ENABLE ROW LEVEL SECURITY;

-- Allow public read access (for login page)
CREATE POLICY "Anyone can view branding settings"
ON public.branding_settings
FOR SELECT
USING (true);

-- Allow admin update access
CREATE POLICY "Admins can update branding settings"
ON public.branding_settings
FOR UPDATE
USING (public.is_admin(auth.uid()));

-- Allow admin insert access
CREATE POLICY "Admins can insert branding settings"
ON public.branding_settings
FOR INSERT
WITH CHECK (public.is_admin(auth.uid()));

-- Create storage bucket for branding assets
INSERT INTO storage.buckets (id, name, public) VALUES ('branding', 'branding', true);

-- Storage policies for branding bucket
CREATE POLICY "Anyone can view branding assets"
ON storage.objects
FOR SELECT
USING (bucket_id = 'branding');

CREATE POLICY "Admins can upload branding assets"
ON storage.objects
FOR INSERT
WITH CHECK (bucket_id = 'branding' AND public.is_admin(auth.uid()));

CREATE POLICY "Admins can update branding assets"
ON storage.objects
FOR UPDATE
USING (bucket_id = 'branding' AND public.is_admin(auth.uid()));

CREATE POLICY "Admins can delete branding assets"
ON storage.objects
FOR DELETE
USING (bucket_id = 'branding' AND public.is_admin(auth.uid()));