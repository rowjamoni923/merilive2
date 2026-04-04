CREATE TABLE public.app_icon_registry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  icon_key TEXT UNIQUE NOT NULL,
  icon_name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'general',
  icon_type TEXT NOT NULL DEFAULT 'lucide',
  lucide_name TEXT,
  icon_url TEXT,
  animation_url TEXT,
  fallback_emoji TEXT,
  color_hex TEXT,
  description TEXT,
  display_order INT DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_icon_registry_category ON public.app_icon_registry(category);
CREATE INDEX idx_icon_registry_key ON public.app_icon_registry(icon_key);

ALTER TABLE public.app_icon_registry ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read icons"
  ON public.app_icon_registry FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can manage icons"
  ON public.app_icon_registry FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

INSERT INTO storage.buckets (id, name, public)
VALUES ('app-icons', 'app-icons', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Anyone can view app icons"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'app-icons');

CREATE POLICY "Authenticated users can upload app icons"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'app-icons');

CREATE POLICY "Authenticated users can update app icons"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'app-icons');

CREATE POLICY "Authenticated users can delete app icons"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'app-icons');