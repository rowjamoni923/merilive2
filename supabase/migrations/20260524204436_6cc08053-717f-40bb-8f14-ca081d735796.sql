-- Pkg322 pass-2 — stream_viewers UPDATE column allow-list

CREATE OR REPLACE FUNCTION public.guard_stream_viewers_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF current_setting('request.jwt.claim.role', true) = 'service_role' THEN RETURN NEW; END IF;
  IF public.is_active_admin_session() THEN RETURN NEW; END IF;
  IF public.is_admin(auth.uid()) THEN RETURN NEW; END IF;

  IF NEW.stream_id IS DISTINCT FROM OLD.stream_id THEN
    RAISE EXCEPTION 'stream_viewers.stream_id is immutable';
  END IF;
  IF NEW.viewer_id IS DISTINCT FROM OLD.viewer_id THEN
    RAISE EXCEPTION 'stream_viewers.viewer_id is immutable';
  END IF;
  IF NEW.joined_at IS DISTINCT FROM OLD.joined_at THEN
    RAISE EXCEPTION 'stream_viewers.joined_at is immutable';
  END IF;
  IF NEW.left_at IS DISTINCT FROM OLD.left_at THEN
    RAISE EXCEPTION 'stream_viewers.left_at is server-managed';
  END IF;
  IF NEW.is_active IS DISTINCT FROM OLD.is_active THEN
    RAISE EXCEPTION 'stream_viewers.is_active is server-managed';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_stream_viewers_update ON public.stream_viewers;
CREATE TRIGGER trg_guard_stream_viewers_update
BEFORE UPDATE ON public.stream_viewers
FOR EACH ROW EXECUTE FUNCTION public.guard_stream_viewers_update();
