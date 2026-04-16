-- ============================================
-- FIX 1: app_icon_registry missing columns
-- ============================================
ALTER TABLE public.app_icon_registry
  ADD COLUMN IF NOT EXISTS icon_name text,
  ADD COLUMN IF NOT EXISTS icon_type text DEFAULT 'lucide',
  ADD COLUMN IF NOT EXISTS lucide_name text,
  ADD COLUMN IF NOT EXISTS icon_url text,
  ADD COLUMN IF NOT EXISTS animation_url text,
  ADD COLUMN IF NOT EXISTS fallback_emoji text,
  ADD COLUMN IF NOT EXISTS color_hex text;

-- Backfill icon_name from icon_label for existing rows
UPDATE public.app_icon_registry
  SET icon_name = icon_label
  WHERE icon_name IS NULL AND icon_label IS NOT NULL;

-- ============================================
-- FIX 2: app_event_themes missing columns
-- ============================================
ALTER TABLE public.app_event_themes
  ADD COLUMN IF NOT EXISTS theme_key text,
  ADD COLUMN IF NOT EXISTS theme_icon text DEFAULT '🎉',
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS primary_color text DEFAULT '280 100% 50%',
  ADD COLUMN IF NOT EXISTS secondary_color text DEFAULT '320 100% 50%',
  ADD COLUMN IF NOT EXISTS accent_color text DEFAULT '45 100% 50%',
  ADD COLUMN IF NOT EXISTS nav_bg_color text DEFAULT '240 20% 8%',
  ADD COLUMN IF NOT EXISTS nav_active_color text DEFAULT '280 100% 60%',
  ADD COLUMN IF NOT EXISTS tab_active_color text DEFAULT '280 100% 55%',
  ADD COLUMN IF NOT EXISTS card_border_color text DEFAULT '280 50% 30%',
  ADD COLUMN IF NOT EXISTS header_gradient_from text DEFAULT '280 100% 40%',
  ADD COLUMN IF NOT EXISTS header_gradient_to text DEFAULT '320 100% 45%',
  ADD COLUMN IF NOT EXISTS floating_particles text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS starts_at timestamptz,
  ADD COLUMN IF NOT EXISTS ends_at timestamptz,
  ADD COLUMN IF NOT EXISTS auto_schedule boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS display_order integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS country_code text DEFAULT 'GLOBAL',
  ADD COLUMN IF NOT EXISTS nav_home_icon_url text,
  ADD COLUMN IF NOT EXISTS nav_party_icon_url text,
  ADD COLUMN IF NOT EXISTS nav_reels_icon_url text,
  ADD COLUMN IF NOT EXISTS nav_profile_icon_url text;

-- Backfill theme_key from event_type for existing rows
UPDATE public.app_event_themes
  SET theme_key = event_type
  WHERE theme_key IS NULL AND event_type IS NOT NULL;