-- Create VIP Exclusive Items table for tier-specific privileges
CREATE TABLE IF NOT EXISTS public.vip_exclusive_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vip_tier_id UUID NOT NULL REFERENCES public.vip_tiers(id) ON DELETE CASCADE,
  item_type TEXT NOT NULL DEFAULT 'frame', -- 'frame', 'entry_bar', 'gift', 'bubble', 'sticker', 'badge'
  name TEXT NOT NULL,
  description TEXT,
  animation_url TEXT,
  preview_url TEXT,
  is_active BOOLEAN DEFAULT true,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.vip_exclusive_items ENABLE ROW LEVEL SECURITY;

-- Public can view active items
CREATE POLICY "Anyone can view active VIP exclusive items"
  ON public.vip_exclusive_items FOR SELECT
  USING (is_active = true);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_vip_exclusive_items_tier ON public.vip_exclusive_items(vip_tier_id);
CREATE INDEX IF NOT EXISTS idx_vip_exclusive_items_type ON public.vip_exclusive_items(item_type);