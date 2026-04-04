-- Create app version settings table for reliable update checking
CREATE TABLE IF NOT EXISTS public.app_version_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  platform TEXT NOT NULL DEFAULT 'android',
  current_version_code INTEGER NOT NULL DEFAULT 1,
  current_version_name TEXT NOT NULL DEFAULT '1.0.0',
  min_version_code INTEGER NOT NULL DEFAULT 1,
  force_update BOOLEAN DEFAULT false,
  update_message TEXT DEFAULT 'নতুন আপডেট উপলব্ধ! নতুন ফিচার ও বাগ ফিক্স পেতে এখনই আপডেট করুন।',
  play_store_url TEXT DEFAULT 'https://play.google.com/store/apps/details?id=com.merilive.app',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(platform)
);

-- Enable RLS
ALTER TABLE public.app_version_settings ENABLE ROW LEVEL SECURITY;

-- Everyone can read version info
CREATE POLICY "Anyone can read app version settings" 
ON public.app_version_settings 
FOR SELECT 
USING (true);

-- Only authenticated admins can update
CREATE POLICY "Authenticated users can update app version settings" 
ON public.app_version_settings 
FOR UPDATE 
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can insert app version settings" 
ON public.app_version_settings 
FOR INSERT 
TO authenticated
WITH CHECK (true);

-- Insert default Android version
INSERT INTO public.app_version_settings (platform, current_version_code, current_version_name, min_version_code, force_update)
VALUES ('android', 4, '4.0.0', 1, false)
ON CONFLICT (platform) DO NOTHING;

-- Insert default iOS version (for future)
INSERT INTO public.app_version_settings (platform, current_version_code, current_version_name, min_version_code, force_update)
VALUES ('ios', 1, '1.0.0', 1, false)
ON CONFLICT (platform) DO NOTHING;