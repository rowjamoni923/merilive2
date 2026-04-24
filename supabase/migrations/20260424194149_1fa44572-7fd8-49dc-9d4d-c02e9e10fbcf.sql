
ALTER TABLE public.beauty_filters
  ADD COLUMN IF NOT EXISTS slug text,
  ADD COLUMN IF NOT EXISTS matrix jsonb,
  ADD COLUMN IF NOT EXISTS icon_name text;

CREATE UNIQUE INDEX IF NOT EXISTS beauty_filters_slug_key
  ON public.beauty_filters (slug) WHERE slug IS NOT NULL;

ALTER TABLE public.ar_stickers
  ADD COLUMN IF NOT EXISTS slug text,
  ADD COLUMN IF NOT EXISTS asset_url text,
  ADD COLUMN IF NOT EXISTS is_premium boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS diamond_cost integer NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX IF NOT EXISTS ar_stickers_slug_key
  ON public.ar_stickers (slug) WHERE slug IS NOT NULL;

UPDATE public.ar_stickers
   SET asset_url = COALESCE(asset_url, file_url)
 WHERE asset_url IS NULL;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS beauty_presets jsonb;

-- Seed beauty_filters (file_url placeholder = empty string for matrix-based filters)
INSERT INTO public.beauty_filters (name, slug, matrix, icon_name, display_order, is_active, is_free, category, filter_key, file_url, preview_url)
VALUES
  ('None',    'none',    '[1,0,0,0,0, 0,1,0,0,0, 0,0,1,0,0, 0,0,0,1,0]'::jsonb,                  'Ban',      0, true, true, 'basic', 'none',    '', ''),
  ('Natural', 'natural', '[1.0,0,0,0,10, 0,1.0,0,0,5, 0,0,1.0,0,0, 0,0,0,1,0]'::jsonb,          'Leaf',     1, true, true, 'basic', 'natural', '', ''),
  ('Bright',  'bright',  '[1.1,0,0,0,20, 0,1.1,0,0,20, 0,0,1.1,0,20, 0,0,0,1,0]'::jsonb,        'Sun',      2, true, true, 'basic', 'bright',  '', ''),
  ('Rosy',    'rosy',    '[1.1,0,0,0,30, 0,1.0,0,0,10, 0,0,1.0,0,15, 0,0,0,1,0]'::jsonb,        'Heart',    3, true, true, 'basic', 'rosy',    '', ''),
  ('Fresh',   'fresh',   '[1.0,0,0,0,5, 0,1.1,0,0,15, 0,0,1.2,0,25, 0,0,0,1,0]'::jsonb,         'Sparkles', 4, true, true, 'basic', 'fresh',   '', '')
ON CONFLICT (slug) WHERE slug IS NOT NULL DO UPDATE
  SET matrix = EXCLUDED.matrix,
      icon_name = EXCLUDED.icon_name,
      display_order = EXCLUDED.display_order;

INSERT INTO public.ar_stickers (name, slug, category, is_premium, diamond_cost, display_order, is_active, is_free, file_url, preview_url, asset_url)
VALUES
  ('None',         'none',         'Basic',  false, 0,   0, true, true,  '', '', ''),
  ('Cat Ears',     'cat_ears',     'Head',   false, 0,   1, true, true,  '', '', ''),
  ('Cute Dog',     'cute_dog',     'Head',   false, 0,   2, true, true,  '', '', ''),
  ('Neon Glasses', 'neon_glasses', 'Eyes',   false, 0,   3, true, true,  '', '', ''),
  ('Flower Crown', 'flower_crown', 'Head',   false, 0,   4, true, true,  '', '', ''),
  ('Fire Mask',    'fire_mask',    'Face',   true,  50,  5, true, false, '', '', ''),
  ('Angel Wings',  'angel_wings',  'Head',   true,  100, 6, true, false, '', '', ''),
  ('Crown',        'crown',        'Head',   true,  150, 7, true, false, '', '', ''),
  ('Bunny Ears',   'bunny_ears',   'Head',   false, 0,   8, true, true,  '', '', ''),
  ('Devil Horns',  'devil_horns',  'Head',   true,  80,  9, true, false, '', '', ''),
  ('Heart Eyes',   'heart_eyes',   'Eyes',   false, 0,  10, true, true,  '', '', ''),
  ('Star Eyes',    'star_eyes',    'Eyes',   false, 0,  11, true, true,  '', '', '')
ON CONFLICT (slug) WHERE slug IS NOT NULL DO UPDATE
  SET name = EXCLUDED.name,
      category = EXCLUDED.category,
      display_order = EXCLUDED.display_order;

CREATE OR REPLACE FUNCTION public.get_active_beauty_assets()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'filters', COALESCE((
      SELECT jsonb_agg(to_jsonb(f.*) ORDER BY f.display_order)
      FROM public.beauty_filters f
      WHERE f.is_active = true AND f.slug IS NOT NULL
    ), '[]'::jsonb),
    'stickers', COALESCE((
      SELECT jsonb_agg(to_jsonb(s.*) ORDER BY s.display_order)
      FROM public.ar_stickers s
      WHERE s.is_active = true AND s.slug IS NOT NULL
    ), '[]'::jsonb)
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_active_beauty_assets() TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.update_user_beauty_presets(_presets jsonb)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  PERFORM set_config('app.bypass_profile_protection', 'true', true);
  UPDATE public.profiles
     SET beauty_presets = _presets,
         updated_at = now()
   WHERE id = auth.uid();
  PERFORM set_config('app.bypass_profile_protection', 'false', true);

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_user_beauty_presets(jsonb) TO authenticated;

ALTER TABLE public.beauty_filters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ar_stickers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can view active beauty filters" ON public.beauty_filters;
CREATE POLICY "Public can view active beauty filters"
  ON public.beauty_filters FOR SELECT
  USING (is_active = true);

DROP POLICY IF EXISTS "Public can view active ar stickers" ON public.ar_stickers;
CREATE POLICY "Public can view active ar stickers"
  ON public.ar_stickers FOR SELECT
  USING (is_active = true);
