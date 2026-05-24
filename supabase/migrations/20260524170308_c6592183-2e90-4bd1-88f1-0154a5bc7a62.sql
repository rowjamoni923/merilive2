-- Pkg310 pass-2: Reels & Content deep hardening

-- Missing table used by the Reels "Save" action
CREATE TABLE IF NOT EXISTS public.saved_reels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reel_id uuid NOT NULL REFERENCES public.reels(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, reel_id)
);

ALTER TABLE public.saved_reels ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their saved reels" ON public.saved_reels;
CREATE POLICY "Users can manage their saved reels"
ON public.saved_reels
FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (
    SELECT 1 FROM public.reels r
    WHERE r.id = reel_id
      AND COALESCE(r.is_active, true) = true
      AND COALESCE(r.is_approved, true) = true
      AND COALESCE(r.is_public, true) = true
  )
);

-- Normalize columns expected by the Reels UI and triggers.
ALTER TABLE public.reel_comments
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS like_count integer NOT NULL DEFAULT 0;

ALTER TABLE public.reel_reports
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS reviewed_by uuid,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;

ALTER TABLE public.reel_shares
  ADD COLUMN IF NOT EXISTS share_type text DEFAULT 'link';

CREATE INDEX IF NOT EXISTS idx_reels_public_feed
  ON public.reels (created_at DESC)
  WHERE COALESCE(is_active, true) = true
    AND COALESCE(is_approved, true) = true
    AND COALESCE(is_public, true) = true;
CREATE INDEX IF NOT EXISTS idx_reel_comments_reel_active ON public.reel_comments (reel_id, created_at DESC) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_reel_likes_user_reel ON public.reel_likes (user_id, reel_id);
CREATE INDEX IF NOT EXISTS idx_reel_reports_user_reel ON public.reel_reports (user_id, reel_id);

-- Strict RLS policies for reels and related tables.
DROP POLICY IF EXISTS "Anyone can view approved active reels" ON public.reels;
DROP POLICY IF EXISTS "Hosts can create reels" ON public.reels;
DROP POLICY IF EXISTS "Users can update their own reels" ON public.reels;
DROP POLICY IF EXISTS "Users can delete their own reels" ON public.reels;
DROP POLICY IF EXISTS read_reels ON public.reels;
DROP POLICY IF EXISTS u_ins_reels ON public.reels;
DROP POLICY IF EXISTS u_upd_reels ON public.reels;
DROP POLICY IF EXISTS u_del_reels ON public.reels;

CREATE POLICY read_reels
ON public.reels
FOR SELECT
TO public
USING (
  (
    COALESCE(is_active, true) = true
    AND COALESCE(is_approved, true) = true
    AND COALESCE(is_public, true) = true
  )
  OR auth.uid() = user_id
  OR public.is_active_admin_session()
);

CREATE POLICY u_ins_reels
ON public.reels
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND COALESCE(p.is_host, false) = true
  )
);

CREATE POLICY u_upd_reels
ON public.reels
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id OR public.is_active_admin_session())
WITH CHECK (auth.uid() = user_id OR public.is_active_admin_session());

CREATE POLICY u_del_reels
ON public.reels
FOR DELETE
TO authenticated
USING (auth.uid() = user_id OR public.is_active_admin_session());

DROP POLICY IF EXISTS "Anyone can view reel likes" ON public.reel_likes;
DROP POLICY IF EXISTS "Authenticated users can like reels" ON public.reel_likes;
DROP POLICY IF EXISTS "Users can unlike their own likes" ON public.reel_likes;
DROP POLICY IF EXISTS authenticated_read_reel_likes ON public.reel_likes;
DROP POLICY IF EXISTS u_ins_reel_likes ON public.reel_likes;
DROP POLICY IF EXISTS u_del_reel_likes ON public.reel_likes;

CREATE POLICY authenticated_read_reel_likes
ON public.reel_likes
FOR SELECT
TO authenticated
USING (auth.uid() = user_id OR public.is_active_admin_session());

CREATE POLICY u_ins_reel_likes
ON public.reel_likes
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (
    SELECT 1 FROM public.reels r
    WHERE r.id = reel_id
      AND COALESCE(r.is_active, true) = true
      AND COALESCE(r.is_approved, true) = true
      AND COALESCE(r.is_public, true) = true
  )
);

CREATE POLICY u_del_reel_likes
ON public.reel_likes
FOR DELETE
TO authenticated
USING (auth.uid() = user_id OR public.is_active_admin_session());

DROP POLICY IF EXISTS "Anyone can view active comments" ON public.reel_comments;
DROP POLICY IF EXISTS "Authenticated users can comment" ON public.reel_comments;
DROP POLICY IF EXISTS "Users can update their own comments" ON public.reel_comments;
DROP POLICY IF EXISTS "Users can delete their own comments" ON public.reel_comments;
DROP POLICY IF EXISTS authenticated_read_reel_comments ON public.reel_comments;
DROP POLICY IF EXISTS u_ins_reel_comments ON public.reel_comments;
DROP POLICY IF EXISTS u_del_reel_comments ON public.reel_comments;

CREATE POLICY authenticated_read_reel_comments
ON public.reel_comments
FOR SELECT
TO public
USING (
  COALESCE(is_active, true) = true
  AND EXISTS (
    SELECT 1 FROM public.reels r
    WHERE r.id = reel_id
      AND COALESCE(r.is_active, true) = true
      AND COALESCE(r.is_approved, true) = true
      AND COALESCE(r.is_public, true) = true
  )
);

CREATE POLICY u_ins_reel_comments
ON public.reel_comments
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND char_length(btrim(content)) BETWEEN 1 AND 500
  AND EXISTS (
    SELECT 1 FROM public.reels r
    WHERE r.id = reel_id
      AND COALESCE(r.is_active, true) = true
      AND COALESCE(r.is_approved, true) = true
      AND COALESCE(r.is_public, true) = true
  )
);

CREATE POLICY u_del_reel_comments
ON public.reel_comments
FOR DELETE
TO authenticated
USING (auth.uid() = user_id OR public.is_active_admin_session());

DROP POLICY IF EXISTS "Authenticated users can share reels" ON public.reel_shares;
DROP POLICY IF EXISTS "Anyone can view shares" ON public.reel_shares;
DROP POLICY IF EXISTS authenticated_read_reel_shares ON public.reel_shares;
DROP POLICY IF EXISTS u_ins_reel_shares ON public.reel_shares;

CREATE POLICY authenticated_read_reel_shares
ON public.reel_shares
FOR SELECT
TO authenticated
USING (auth.uid() = user_id OR public.is_active_admin_session());

CREATE POLICY u_ins_reel_shares
ON public.reel_shares
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (
    SELECT 1 FROM public.reels r
    WHERE r.id = reel_id
      AND COALESCE(r.is_active, true) = true
      AND COALESCE(r.is_approved, true) = true
      AND COALESCE(r.is_public, true) = true
  )
);

DROP POLICY IF EXISTS "Authenticated users can report reels" ON public.reel_reports;
DROP POLICY IF EXISTS "Users can view their own reports" ON public.reel_reports;
DROP POLICY IF EXISTS u_ins_reel_reports ON public.reel_reports;
DROP POLICY IF EXISTS u_read_reel_reports ON public.reel_reports;

CREATE POLICY u_ins_reel_reports
ON public.reel_reports
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND char_length(btrim(reason)) BETWEEN 2 AND 80
  AND COALESCE(status, 'pending') = 'pending'
  AND NOT EXISTS (
    SELECT 1 FROM public.reels own_reel
    WHERE own_reel.id = reel_id
      AND own_reel.user_id = auth.uid()
  )
  AND EXISTS (
    SELECT 1 FROM public.reels r
    WHERE r.id = reel_id
      AND COALESCE(r.is_active, true) = true
      AND COALESCE(r.is_approved, true) = true
      AND COALESCE(r.is_public, true) = true
  )
);

CREATE POLICY u_read_reel_reports
ON public.reel_reports
FOR SELECT
TO authenticated
USING (auth.uid() = user_id OR public.is_active_admin_session());

-- Trigger guards: users cannot forge identity, moderation state, media ownership, or counters.
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
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_reels_user_write_trigger ON public.reels;
CREATE TRIGGER guard_reels_user_write_trigger
BEFORE INSERT OR UPDATE ON public.reels
FOR EACH ROW EXECUTE FUNCTION public.guard_reels_user_write();

CREATE OR REPLACE FUNCTION public.guard_reel_comment_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() = 'service_role' OR public.is_active_admin_session() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF auth.uid() IS NULL OR NEW.user_id IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION 'Cannot comment as another user';
    END IF;
    NEW.content := btrim(NEW.content);
    IF char_length(NEW.content) NOT BETWEEN 1 AND 500 THEN
      RAISE EXCEPTION 'Comment must be 1-500 characters';
    END IF;
    IF NEW.parent_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.reel_comments c WHERE c.id = NEW.parent_id AND c.reel_id = NEW.reel_id
    ) THEN
      RAISE EXCEPTION 'Reply must belong to the same reel';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.user_id IS DISTINCT FROM OLD.user_id
      OR NEW.reel_id IS DISTINCT FROM OLD.reel_id
      OR NEW.parent_id IS DISTINCT FROM OLD.parent_id
      OR NEW.like_count IS DISTINCT FROM OLD.like_count
      OR NEW.likes_count IS DISTINCT FROM OLD.likes_count THEN
      RAISE EXCEPTION 'Protected comment fields cannot be edited directly';
    END IF;
    NEW.content := btrim(NEW.content);
    IF char_length(NEW.content) NOT BETWEEN 1 AND 500 THEN
      RAISE EXCEPTION 'Comment must be 1-500 characters';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_reel_comment_write_trigger ON public.reel_comments;
CREATE TRIGGER guard_reel_comment_write_trigger
BEFORE INSERT OR UPDATE ON public.reel_comments
FOR EACH ROW EXECUTE FUNCTION public.guard_reel_comment_write();

CREATE OR REPLACE FUNCTION public.guard_reel_report_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() = 'service_role' OR public.is_active_admin_session() THEN
    RETURN NEW;
  END IF;

  IF auth.uid() IS NULL OR NEW.user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Cannot report as another user';
  END IF;

  NEW.reason := btrim(NEW.reason);
  NEW.status := COALESCE(NEW.status, 'pending');

  IF NEW.status <> 'pending' THEN
    RAISE EXCEPTION 'Report status is admin-managed';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.reels r WHERE r.id = NEW.reel_id AND r.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Cannot report your own reel';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.reel_reports existing
    WHERE existing.reel_id = NEW.reel_id
      AND existing.user_id = auth.uid()
      AND existing.status = 'pending'
      AND (TG_OP = 'INSERT' OR existing.id <> NEW.id)
  ) THEN
    RAISE EXCEPTION 'You already reported this reel';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_reel_report_write_trigger ON public.reel_reports;
CREATE TRIGGER guard_reel_report_write_trigger
BEFORE INSERT OR UPDATE ON public.reel_reports
FOR EACH ROW EXECUTE FUNCTION public.guard_reel_report_write();

-- Trusted counter maintenance. The app no longer updates reel counters directly.
CREATE OR REPLACE FUNCTION public.bump_reel_counter(_reel_id uuid, _field text, _delta integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM set_config('app.reel_counter_update', '1', true);

  IF _field = 'like' THEN
    UPDATE public.reels
    SET like_count = GREATEST(0, COALESCE(like_count, 0) + _delta),
        likes_count = GREATEST(0, COALESCE(likes_count, 0) + _delta)
    WHERE id = _reel_id;
  ELSIF _field = 'comment' THEN
    UPDATE public.reels
    SET comment_count = GREATEST(0, COALESCE(comment_count, 0) + _delta),
        comments_count = GREATEST(0, COALESCE(comments_count, 0) + _delta)
    WHERE id = _reel_id;
  ELSIF _field = 'share' THEN
    UPDATE public.reels
    SET share_count = GREATEST(0, COALESCE(share_count, 0) + _delta),
        shares_count = GREATEST(0, COALESCE(shares_count, 0) + _delta)
    WHERE id = _reel_id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_reel_like_counter()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.bump_reel_counter(NEW.reel_id, 'like', 1);
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM public.bump_reel_counter(OLD.reel_id, 'like', -1);
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS reel_like_counter_trigger ON public.reel_likes;
CREATE TRIGGER reel_like_counter_trigger
AFTER INSERT OR DELETE ON public.reel_likes
FOR EACH ROW EXECUTE FUNCTION public.handle_reel_like_counter();

CREATE OR REPLACE FUNCTION public.handle_reel_comment_counter()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF COALESCE(NEW.is_active, true) THEN
      PERFORM public.bump_reel_counter(NEW.reel_id, 'comment', 1);
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    IF COALESCE(OLD.is_active, true) THEN
      PERFORM public.bump_reel_counter(OLD.reel_id, 'comment', -1);
    END IF;
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    IF COALESCE(OLD.is_active, true) IS DISTINCT FROM COALESCE(NEW.is_active, true) THEN
      PERFORM public.bump_reel_counter(NEW.reel_id, 'comment', CASE WHEN NEW.is_active THEN 1 ELSE -1 END);
    END IF;
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS reel_comment_counter_trigger ON public.reel_comments;
CREATE TRIGGER reel_comment_counter_trigger
AFTER INSERT OR UPDATE OF is_active OR DELETE ON public.reel_comments
FOR EACH ROW EXECUTE FUNCTION public.handle_reel_comment_counter();

CREATE OR REPLACE FUNCTION public.handle_reel_share_counter()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.bump_reel_counter(NEW.reel_id, 'share', 1);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS reel_share_counter_trigger ON public.reel_shares;
CREATE TRIGGER reel_share_counter_trigger
AFTER INSERT ON public.reel_shares
FOR EACH ROW EXECUTE FUNCTION public.handle_reel_share_counter();

-- Safer view increment: public-facing, but only affects visible reels.
CREATE OR REPLACE FUNCTION public.increment_reel_view(reel_uuid uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM set_config('app.reel_counter_update', '1', true);
  UPDATE public.reels
  SET view_count = COALESCE(view_count, 0) + 1,
      views_count = COALESCE(views_count, 0) + 1
  WHERE id = reel_uuid
    AND COALESCE(is_active, true) = true
    AND COALESCE(is_approved, true) = true
    AND COALESCE(is_public, true) = true;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.increment_reel_view(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_reel_view(uuid) TO anon, authenticated;

-- Admin reel RPCs must validate the server-side session token, not a client-supplied UUID.
CREATE OR REPLACE FUNCTION public.admin_list_reels(_admin_id uuid DEFAULT NULL, _limit int DEFAULT 200)
RETURNS SETOF public.reels
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT *
  FROM public.reels
  WHERE public.current_admin_id_from_header() IS NOT NULL
  ORDER BY created_at DESC
  LIMIT LEAST(GREATEST(COALESCE(_limit, 200), 1), 500);
$$;

CREATE OR REPLACE FUNCTION public.admin_delete_reel(_admin_id uuid, _reel_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.current_admin_id_from_header() IS NULL THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  DELETE FROM public.reels WHERE id = _reel_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_list_reels(uuid,int) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_delete_reel(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_list_reels(uuid,int) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_reel(uuid,uuid) TO anon, authenticated;

-- Reels storage: prevent authenticated users from uploading into another user's folder.
DROP POLICY IF EXISTS "Authenticated users can upload reels" ON storage.objects;
CREATE POLICY "Authenticated users can upload reels"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'reels'
  AND auth.uid() IS NOT NULL
  AND auth.uid()::text = (storage.foldername(name))[1]
);
