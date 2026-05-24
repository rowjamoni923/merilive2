-- Pkg310 pass-3b: align live reels schema with admin/UI expectations

ALTER TABLE public.reels
  ADD COLUMN IF NOT EXISTS is_featured boolean DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_reels_featured_public
  ON public.reels(created_at DESC)
  WHERE is_featured = true
    AND COALESCE(is_active, true) = true
    AND COALESCE(is_approved, true) = true
    AND COALESCE(is_public, true) = true;

CREATE OR REPLACE FUNCTION public.guard_reels_user_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() = 'service_role'
     OR public.is_active_admin_session()
     OR current_setting('app.reel_counter_update', true) = '1' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF auth.uid() IS NULL OR NEW.user_id IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION 'Cannot create reel for another user';
    END IF;
    NEW.caption := NULLIF(btrim(COALESCE(NEW.caption, '')), '');
    IF NEW.caption IS NOT NULL AND char_length(NEW.caption) > 2200 THEN
      RAISE EXCEPTION 'Caption is too long';
    END IF;
    NEW.is_featured := false;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF auth.uid() IS NULL OR OLD.user_id IS DISTINCT FROM auth.uid() OR NEW.user_id IS DISTINCT FROM OLD.user_id THEN
      RAISE EXCEPTION 'Cannot transfer reel ownership';
    END IF;

    IF NEW.video_url IS DISTINCT FROM OLD.video_url
      OR NEW.thumbnail_url IS DISTINCT FROM OLD.thumbnail_url
      OR NEW.view_count IS DISTINCT FROM OLD.view_count
      OR NEW.views_count IS DISTINCT FROM OLD.views_count
      OR NEW.like_count IS DISTINCT FROM OLD.like_count
      OR NEW.likes_count IS DISTINCT FROM OLD.likes_count
      OR NEW.comment_count IS DISTINCT FROM OLD.comment_count
      OR NEW.comments_count IS DISTINCT FROM OLD.comments_count
      OR NEW.share_count IS DISTINCT FROM OLD.share_count
      OR NEW.shares_count IS DISTINCT FROM OLD.shares_count
      OR NEW.beans_earned IS DISTINCT FROM OLD.beans_earned
      OR NEW.is_approved IS DISTINCT FROM OLD.is_approved
      OR NEW.is_active IS DISTINCT FROM OLD.is_active
      OR NEW.is_featured IS DISTINCT FROM OLD.is_featured THEN
      RAISE EXCEPTION 'Protected reel fields cannot be edited directly';
    END IF;

    NEW.caption := NULLIF(btrim(COALESCE(NEW.caption, '')), '');
    IF NEW.caption IS NOT NULL AND char_length(NEW.caption) > 2200 THEN
      RAISE EXCEPTION 'Caption is too long';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_update_reel_status(
  _reel_id uuid,
  _is_approved boolean DEFAULT NULL,
  _is_active boolean DEFAULT NULL,
  _is_featured boolean DEFAULT NULL
)
RETURNS public.reels
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.reels;
BEGIN
  IF public.current_admin_id_from_header() IS NULL THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  UPDATE public.reels
  SET is_approved = COALESCE(_is_approved, is_approved),
      is_active = COALESCE(_is_active, is_active),
      is_featured = COALESCE(_is_featured, is_featured),
      updated_at = now()
  WHERE id = _reel_id
  RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'reel not found';
  END IF;

  RETURN v_row;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_update_reel_status(uuid, boolean, boolean) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_update_reel_status(uuid, boolean, boolean, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_update_reel_status(uuid, boolean, boolean, boolean) TO anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.guard_reels_user_write() FROM PUBLIC, anon, authenticated;