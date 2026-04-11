-- Add missing columns to shop_items table
ALTER TABLE public.shop_items
  ADD COLUMN IF NOT EXISTS animation_file_url text,
  ADD COLUMN IF NOT EXISTS file_type text DEFAULT 'image',
  ADD COLUMN IF NOT EXISTS animation_type text DEFAULT 'static',
  ADD COLUMN IF NOT EXISTS rarity text DEFAULT 'common',
  ADD COLUMN IF NOT EXISTS is_premium boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_featured boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS min_level integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_sold integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sound_url text,
  ADD COLUMN IF NOT EXISTS sound_duration_ms integer DEFAULT 3000;

-- Copy existing data to new columns where applicable
UPDATE public.shop_items SET animation_file_url = COALESCE(svga_url, animation_url) WHERE animation_file_url IS NULL;
UPDATE public.shop_items SET min_level = COALESCE(level_required, 0) WHERE min_level = 0 AND level_required IS NOT NULL;
UPDATE public.shop_items SET file_type = COALESCE(item_type, 'image') WHERE file_type = 'image' AND item_type IS NOT NULL;