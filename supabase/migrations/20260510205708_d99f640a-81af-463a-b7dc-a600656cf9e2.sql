-- 1) Add column
ALTER TABLE public.party_room_backgrounds
  ADD COLUMN IF NOT EXISTS min_level integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_party_room_backgrounds_min_level
  ON public.party_room_backgrounds(min_level);

-- 2) Update list RPC to include min_level
CREATE OR REPLACE FUNCTION public.admin_list_party_backgrounds(_admin_id uuid)
RETURNS SETOF public.party_room_backgrounds
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_active_admin_session() AND NOT public.is_admin(_admin_id) THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;
  RETURN QUERY
    SELECT * FROM public.party_room_backgrounds
    ORDER BY display_order ASC, created_at DESC;
END;
$$;

-- 3) Update upsert RPC to accept min_level (with safe default for old callers)
CREATE OR REPLACE FUNCTION public.admin_upsert_party_background(
  _admin_id uuid,
  _id uuid,
  _name text,
  _image_url text,
  _gradient_css text,
  _category text,
  _is_premium boolean,
  _is_active boolean,
  _price_diamonds integer,
  _display_order integer,
  _min_level integer DEFAULT 0
)
RETURNS public.party_room_backgrounds
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row public.party_room_backgrounds;
BEGIN
  IF NOT public.is_active_admin_session() AND NOT public.is_admin(_admin_id) THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  IF _id IS NULL THEN
    INSERT INTO public.party_room_backgrounds (
      name, image_url, gradient_css, category, is_premium, is_active,
      price_diamonds, display_order, min_level
    ) VALUES (
      _name, _image_url, _gradient_css, COALESCE(_category, 'nature'),
      COALESCE(_is_premium, false), COALESCE(_is_active, true),
      COALESCE(_price_diamonds, 0), COALESCE(_display_order, 0),
      GREATEST(COALESCE(_min_level, 0), 0)
    )
    RETURNING * INTO _row;
  ELSE
    UPDATE public.party_room_backgrounds
       SET name = _name,
           image_url = _image_url,
           gradient_css = _gradient_css,
           category = COALESCE(_category, category),
           is_premium = COALESCE(_is_premium, is_premium),
           is_active = COALESCE(_is_active, is_active),
           price_diamonds = COALESCE(_price_diamonds, price_diamonds),
           display_order = COALESCE(_display_order, display_order),
           min_level = GREATEST(COALESCE(_min_level, 0), 0),
           updated_at = now()
     WHERE id = _id
     RETURNING * INTO _row;
  END IF;

  RETURN _row;
END;
$$;