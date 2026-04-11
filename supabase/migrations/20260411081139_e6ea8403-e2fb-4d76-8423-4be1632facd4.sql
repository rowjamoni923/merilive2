
ALTER TABLE public.banners
  ADD COLUMN IF NOT EXISTS subtitle TEXT,
  ADD COLUMN IF NOT EXISTS link_type TEXT DEFAULT 'external',
  ADD COLUMN IF NOT EXISTS background_color TEXT DEFAULT '#1a1a2e',
  ADD COLUMN IF NOT EXISTS text_color TEXT DEFAULT '#ffffff',
  ADD COLUMN IF NOT EXISTS accent_color TEXT DEFAULT '#ff6b6b';
