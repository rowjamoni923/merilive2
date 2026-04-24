
-- 1) Helper: verify dedicated admin session
CREATE OR REPLACE FUNCTION public.is_admin_session(_admin_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admin_users
    WHERE id = _admin_id AND is_active = true
  );
$$;

-- 2) Party Room Backgrounds: list/create/update/delete via admin session
CREATE OR REPLACE FUNCTION public.admin_list_party_backgrounds(_admin_id uuid)
RETURNS SETOF public.party_room_backgrounds
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin_session(_admin_id) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  RETURN QUERY SELECT * FROM public.party_room_backgrounds ORDER BY display_order ASC NULLS LAST, created_at DESC;
END;
$$;

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
  _display_order integer
)
RETURNS public.party_room_backgrounds
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.party_room_backgrounds;
BEGIN
  IF NOT public.is_admin_session(_admin_id) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  IF _id IS NULL THEN
    INSERT INTO public.party_room_backgrounds (name, image_url, gradient_css, category, is_premium, is_active, price_diamonds, display_order)
    VALUES (_name, _image_url, _gradient_css, _category, COALESCE(_is_premium,false), COALESCE(_is_active,true), COALESCE(_price_diamonds,0), COALESCE(_display_order,1))
    RETURNING * INTO v_row;
  ELSE
    UPDATE public.party_room_backgrounds
    SET name = _name,
        image_url = _image_url,
        gradient_css = _gradient_css,
        category = _category,
        is_premium = COALESCE(_is_premium, is_premium),
        is_active = COALESCE(_is_active, is_active),
        price_diamonds = COALESCE(_price_diamonds, price_diamonds),
        display_order = COALESCE(_display_order, display_order)
    WHERE id = _id
    RETURNING * INTO v_row;
  END IF;

  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_delete_party_background(_admin_id uuid, _id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin_session(_admin_id) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  DELETE FROM public.party_room_backgrounds WHERE id = _id;
  RETURN jsonb_build_object('success', true);
END;
$$;

-- 3) Live Bans: admin-session based unban
CREATE OR REPLACE FUNCTION public.admin_session_unban_live(
  _admin_id uuid,
  _ban_id uuid,
  _reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin_session(_admin_id) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  UPDATE public.live_bans
  SET is_active = false,
      unbanned_by = _admin_id,
      unbanned_at = now(),
      ban_end = COALESCE(ban_end, now())
  WHERE id = _ban_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- 4) User block/unblock via admin session
CREATE OR REPLACE FUNCTION public.admin_session_block_user(
  _admin_id uuid,
  _user_id uuid,
  _block boolean,
  _reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin_session(_admin_id) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  PERFORM set_config('app.bypass_profile_protection', 'true', true);

  IF _block THEN
    UPDATE public.profiles
    SET is_blocked = true,
        blocked_at = now(),
        blocked_reason = _reason
    WHERE id = _user_id;
  ELSE
    UPDATE public.profiles
    SET is_blocked = false,
        blocked_at = NULL,
        blocked_reason = NULL
    WHERE id = _user_id;
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- 5) Indexes for instant load
CREATE INDEX IF NOT EXISTS idx_party_room_bg_order ON public.party_room_backgrounds(display_order, is_active);
CREATE INDEX IF NOT EXISTS idx_live_bans_active_start ON public.live_bans(is_active, ban_start DESC);
CREATE INDEX IF NOT EXISTS idx_user_reports_status_created ON public.user_reports(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_allowed_devices_status ON public.admin_allowed_devices(status, requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_profiles_is_blocked ON public.profiles(is_blocked, blocked_at DESC) WHERE is_blocked = true;
