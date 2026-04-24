
-- 1. VIP TIERS — admin write policy
DROP POLICY IF EXISTS "Admins can manage vip tiers" ON public.vip_tiers;
CREATE POLICY "Admins can manage vip tiers"
ON public.vip_tiers
FOR ALL
TO authenticated
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

-- 2. Missing public buckets
INSERT INTO storage.buckets (id, name, public)
VALUES
  ('entry-banners', 'entry-banners', true),
  ('entry-bars', 'entry-bars', true),
  ('entry-name-bars', 'entry-name-bars', true),
  ('svga-animations', 'svga-animations', true),
  ('medals', 'medals', true),
  ('event-themes', 'event-themes', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- 3. Performance indexes
CREATE INDEX IF NOT EXISTS idx_entry_banners_active_order ON public.entry_banners (is_active, display_order);
CREATE INDEX IF NOT EXISTS idx_vehicle_entrances_active_order ON public.vehicle_entrances (is_active, display_order);
CREATE INDEX IF NOT EXISTS idx_avatar_frames_active_order ON public.avatar_frames (is_active, display_order);
CREATE INDEX IF NOT EXISTS idx_vip_tiers_active ON public.vip_tiers (is_active);
CREATE INDEX IF NOT EXISTS idx_level_privileges_type_active ON public.level_privileges (privilege_type, is_active);
CREATE INDEX IF NOT EXISTS idx_trader_level_tiers_active_num ON public.trader_level_tiers (is_active, level_number);
CREATE INDEX IF NOT EXISTS idx_entry_name_bars_active_order ON public.entry_name_bars (is_active, display_order);
CREATE INDEX IF NOT EXISTS idx_admin_music_library_active_order ON public.admin_music_library (is_active, display_order);
