-- Hidden (admin-deleted) entries for the static Premium Animation Store catalog
CREATE TABLE IF NOT EXISTS public.premium_animations_hidden (
  animation_id text PRIMARY KEY,
  hidden_by uuid,
  hidden_at timestamptz NOT NULL DEFAULT now(),
  reason text
);

ALTER TABLE public.premium_animations_hidden ENABLE ROW LEVEL SECURITY;

-- Public can read (so the user app could later filter too if needed)
DROP POLICY IF EXISTS "Anyone can read hidden premium animations" ON public.premium_animations_hidden;
CREATE POLICY "Anyone can read hidden premium animations"
  ON public.premium_animations_hidden FOR SELECT
  USING (true);

-- Admin panel session has full access (insert / delete to restore)
DROP POLICY IF EXISTS "Admin session full access" ON public.premium_animations_hidden;
CREATE POLICY "Admin session full access"
  ON public.premium_animations_hidden FOR ALL
  USING (public.is_active_admin_session())
  WITH CHECK (public.is_active_admin_session());