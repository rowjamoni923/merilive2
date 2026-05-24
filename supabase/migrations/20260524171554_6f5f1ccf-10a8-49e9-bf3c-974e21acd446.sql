-- Pkg310 pass-3: Reels & Content final database hardening

-- Fix live-schema mismatch in guard_reels_user_write(): current DB has no reels.is_featured column.
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
      OR NEW.is_active IS DISTINCT FROM OLD.is_active THEN
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

-- Backfill/dedupe before adding relationship and uniqueness guarantees.
DELETE FROM public.reel_likes l
WHERE NOT EXISTS (SELECT 1 FROM public.reels r WHERE r.id = l.reel_id)
   OR NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = l.user_id);

DELETE FROM public.reel_likes l
USING public.reel_likes dup
WHERE l.ctid < dup.ctid
  AND l.reel_id = dup.reel_id
  AND l.user_id = dup.user_id;

DELETE FROM public.reel_comments c
WHERE NOT EXISTS (SELECT 1 FROM public.reels r WHERE r.id = c.reel_id)
   OR NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = c.user_id)
   OR (c.parent_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.reel_comments parent WHERE parent.id = c.parent_id));

DELETE FROM public.reel_shares s
WHERE NOT EXISTS (SELECT 1 FROM public.reels r WHERE r.id = s.reel_id)
   OR NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = s.user_id);

DELETE FROM public.reel_reports rr
WHERE rr.status = 'pending'
  AND EXISTS (
    SELECT 1
    FROM public.reel_reports newer
    WHERE newer.reel_id = rr.reel_id
      AND newer.user_id = rr.user_id
      AND newer.status = 'pending'
      AND newer.ctid > rr.ctid
  );

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reel_likes_reel_id_fkey' AND conrelid = 'public.reel_likes'::regclass) THEN
    ALTER TABLE public.reel_likes
      ADD CONSTRAINT reel_likes_reel_id_fkey FOREIGN KEY (reel_id) REFERENCES public.reels(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reel_likes_user_id_fkey' AND conrelid = 'public.reel_likes'::regclass) THEN
    ALTER TABLE public.reel_likes
      ADD CONSTRAINT reel_likes_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reel_likes_reel_id_user_id_key' AND conrelid = 'public.reel_likes'::regclass) THEN
    ALTER TABLE public.reel_likes
      ADD CONSTRAINT reel_likes_reel_id_user_id_key UNIQUE (reel_id, user_id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reel_comments_reel_id_fkey' AND conrelid = 'public.reel_comments'::regclass) THEN
    ALTER TABLE public.reel_comments
      ADD CONSTRAINT reel_comments_reel_id_fkey FOREIGN KEY (reel_id) REFERENCES public.reels(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reel_comments_parent_id_fkey' AND conrelid = 'public.reel_comments'::regclass) THEN
    ALTER TABLE public.reel_comments
      ADD CONSTRAINT reel_comments_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.reel_comments(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reel_shares_reel_id_fkey' AND conrelid = 'public.reel_shares'::regclass) THEN
    ALTER TABLE public.reel_shares
      ADD CONSTRAINT reel_shares_reel_id_fkey FOREIGN KEY (reel_id) REFERENCES public.reels(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reel_shares_user_id_fkey' AND conrelid = 'public.reel_shares'::regclass) THEN
    ALTER TABLE public.reel_shares
      ADD CONSTRAINT reel_shares_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reel_reports_user_reel_pending_unique' AND conrelid = 'public.reel_reports'::regclass) THEN
    CREATE UNIQUE INDEX reel_reports_user_reel_pending_unique
      ON public.reel_reports(user_id, reel_id)
      WHERE status = 'pending';
  END IF;
END $$;

-- Users cannot update/delete report rows; admins use dedicated RPCs.
DROP POLICY IF EXISTS u_upd_reel_reports ON public.reel_reports;
DROP POLICY IF EXISTS u_del_reel_reports ON public.reel_reports;

-- Users cannot update likes/comments/shares; comments are append/delete only in current UI.
DROP POLICY IF EXISTS "Users can update their own comments" ON public.reel_comments;
DROP POLICY IF EXISTS u_upd_reel_comments ON public.reel_comments;
DROP POLICY IF EXISTS u_upd_reel_likes ON public.reel_likes;
DROP POLICY IF EXISTS u_upd_reel_shares ON public.reel_shares;
DROP POLICY IF EXISTS u_del_reel_shares ON public.reel_shares;

CREATE OR REPLACE FUNCTION public.guard_reel_share_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() = 'service_role' OR public.is_active_admin_session() THEN
    RETURN NEW;
  END IF;

  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'Shares are append-only';
  END IF;

  IF auth.uid() IS NULL OR NEW.user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Cannot share as another user';
  END IF;

  NEW.share_type := COALESCE(NULLIF(btrim(NEW.share_type), ''), 'link');
  IF NEW.share_type NOT IN ('native', 'copy', 'link', 'external') THEN
    RAISE EXCEPTION 'Invalid share type';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.reel_shares existing
    WHERE existing.reel_id = NEW.reel_id
      AND existing.user_id = auth.uid()
      AND existing.created_at > now() - interval '10 minutes'
  ) THEN
    RAISE EXCEPTION 'Please wait before sharing this reel again';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_reel_share_write_trigger ON public.reel_shares;
CREATE TRIGGER guard_reel_share_write_trigger
BEFORE INSERT OR UPDATE OR DELETE ON public.reel_shares
FOR EACH ROW EXECUTE FUNCTION public.guard_reel_share_write();

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

  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'Reports are admin-managed after submission';
  END IF;

  IF auth.uid() IS NULL OR NEW.user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Cannot report as another user';
  END IF;

  NEW.reason := btrim(NEW.reason);
  NEW.status := 'pending';
  NEW.reviewed_by := NULL;
  NEW.reviewed_at := NULL;

  IF char_length(NEW.reason) NOT BETWEEN 2 AND 80 THEN
    RAISE EXCEPTION 'Invalid report reason';
  END IF;

  IF EXISTS (SELECT 1 FROM public.reels r WHERE r.id = NEW.reel_id AND r.user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Cannot report your own reel';
  END IF;

  RETURN NEW;
END;
$$;

-- Admin-safe RPCs so the admin panel no longer relies on raw table writes.
CREATE OR REPLACE FUNCTION public.admin_update_reel_status(_reel_id uuid, _is_approved boolean DEFAULT NULL, _is_active boolean DEFAULT NULL)
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
      updated_at = now()
  WHERE id = _reel_id
  RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'reel not found';
  END IF;

  RETURN v_row;
END;
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

CREATE OR REPLACE FUNCTION public.admin_resolve_reel_report(_report_id uuid, _status text)
RETURNS public.reel_reports
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_id uuid;
  v_report public.reel_reports;
BEGIN
  v_admin_id := public.current_admin_id_from_header();
  IF v_admin_id IS NULL THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  IF _status NOT IN ('reviewed', 'dismissed', 'action_taken') THEN
    RAISE EXCEPTION 'invalid status';
  END IF;

  UPDATE public.reel_reports
  SET status = _status,
      reviewed_by = v_admin_id,
      reviewed_at = now()
  WHERE id = _report_id
  RETURNING * INTO v_report;

  IF v_report.id IS NULL THEN
    RAISE EXCEPTION 'report not found';
  END IF;

  RETURN v_report;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.guard_reel_share_write() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.guard_reels_user_write() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.guard_reel_report_write() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_update_reel_status(uuid, boolean, boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_resolve_reel_report(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_update_reel_status(uuid, boolean, boolean) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_resolve_reel_report(uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_reel(uuid, uuid) TO anon, authenticated;