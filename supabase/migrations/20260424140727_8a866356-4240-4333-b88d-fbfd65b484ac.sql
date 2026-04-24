-- ============================================
-- Admin Panel Fix: Schema Alignment + RLS Cleanup
-- ============================================

-- 1) entry_name_bars: add missing columns code expects
ALTER TABLE public.entry_name_bars
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS preview_url text,
  ADD COLUMN IF NOT EXISTS min_level integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS min_vip_tier integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS duration_ms integer DEFAULT 4000;

-- Backfill min_level from level_required if present
UPDATE public.entry_name_bars
SET min_level = COALESCE(min_level, level_required, 1)
WHERE min_level IS NULL OR min_level = 1;

-- 2) Drop legacy/duplicate "deny" policies on avatar_frames that confuse other AIs reading the schema.
-- These were permissive=true USING(false) which had NO effect (OR'd with allow policies),
-- but they make the policy list misleading. Remove them.
DROP POLICY IF EXISTS "No direct frame deletes" ON public.avatar_frames;
DROP POLICY IF EXISTS "No direct frame inserts" ON public.avatar_frames;
DROP POLICY IF EXISTS "No direct frame updates" ON public.avatar_frames;

-- 3) Drop duplicate admin/select policies on avatar_frames; keep ONE clear pair
DROP POLICY IF EXISTS "Admins can manage frames" ON public.avatar_frames;
DROP POLICY IF EXISTS "public_read" ON public.avatar_frames;
DROP POLICY IF EXISTS "public_read_active_avatar_frames_v2" ON public.avatar_frames;
-- Keep: "Admins can manage avatar frames" (FOR ALL using admin_users check)
-- Keep: "Anyone can view frames" (FOR SELECT using true)

-- 4) Make sure entry_name_bars admin policy uses unified is_admin()
DROP POLICY IF EXISTS "Admins can manage entry name bars" ON public.entry_name_bars;
CREATE POLICY "Admins can manage entry name bars"
  ON public.entry_name_bars
  FOR ALL
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- 5) Helpful indexes for fast admin list loads
CREATE INDEX IF NOT EXISTS idx_avatar_frames_active_min_level
  ON public.avatar_frames(is_active, min_level);
CREATE INDEX IF NOT EXISTS idx_entry_name_bars_active_order
  ON public.entry_name_bars(is_active, display_order);