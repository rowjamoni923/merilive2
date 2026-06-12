
CREATE TABLE IF NOT EXISTS public.level_privilege_tiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  privilege_type text NOT NULL,
  unlock_level integer NOT NULL CHECK (unlock_level >= 0 AND unlock_level <= 100),
  name text NOT NULL,
  description text,
  animation_url text,
  animation_format text,
  preview_url text,
  sound_url text,
  duration_ms integer DEFAULT 3000,
  icon_bg_color text DEFAULT '#FEE2E2',
  icon_color text DEFAULT '#EF4444',
  is_active boolean NOT NULL DEFAULT true,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (privilege_type, unlock_level)
);

GRANT SELECT ON public.level_privilege_tiers TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.level_privilege_tiers TO authenticated;
GRANT ALL ON public.level_privilege_tiers TO service_role;

ALTER TABLE public.level_privilege_tiers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active privilege tiers"
  ON public.level_privilege_tiers FOR SELECT
  USING (is_active = true OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert privilege tiers"
  ON public.level_privilege_tiers FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update privilege tiers"
  ON public.level_privilege_tiers FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete privilege tiers"
  ON public.level_privilege_tiers FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS idx_lpt_type_level
  ON public.level_privilege_tiers (privilege_type, unlock_level);

CREATE INDEX IF NOT EXISTS idx_lpt_active
  ON public.level_privilege_tiers (privilege_type, is_active);

CREATE TRIGGER trg_lpt_updated_at
  BEFORE UPDATE ON public.level_privilege_tiers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
