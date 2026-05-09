CREATE TABLE IF NOT EXISTS public.rating_banners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  image_url text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.rating_banners ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read active rating banners" ON public.rating_banners;
CREATE POLICY "Public read active rating banners"
  ON public.rating_banners FOR SELECT
  USING (is_active = true);

DROP POLICY IF EXISTS "Admin session full access" ON public.rating_banners;
CREATE POLICY "Admin session full access"
  ON public.rating_banners FOR ALL
  USING (public.is_active_admin_session())
  WITH CHECK (public.is_active_admin_session());

CREATE INDEX IF NOT EXISTS idx_rating_banners_active_order
  ON public.rating_banners(is_active, display_order);