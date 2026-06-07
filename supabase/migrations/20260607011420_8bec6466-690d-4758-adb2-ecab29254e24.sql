-- Phase 5 Round 6 / J3 fix: lock down notifications UPDATE so the owner can
-- only toggle is_read. Prevents users from rewriting type/title/message/data
-- on their own rows (self-deception only, but trivially fixable).

CREATE OR REPLACE FUNCTION public.guard_notifications_user_write()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- service_role / definer paths bypass via current_setting check
  IF current_setting('request.jwt.claim.role', true) = 'service_role' THEN
    RETURN NEW;
  END IF;

  -- Admins may freely update
  IF public.is_active_admin_session() THEN
    RETURN NEW;
  END IF;

  -- Owner UPDATE: only is_read may change
  IF NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.type    IS DISTINCT FROM OLD.type
     OR NEW.title   IS DISTINCT FROM OLD.title
     OR NEW.message IS DISTINCT FROM OLD.message
     OR NEW.data    IS DISTINCT FROM OLD.data
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.id      IS DISTINCT FROM OLD.id
  THEN
    RAISE EXCEPTION 'notifications: only is_read may be updated by owner'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_notifications_user_write_trg ON public.notifications;
CREATE TRIGGER guard_notifications_user_write_trg
  BEFORE UPDATE ON public.notifications
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_notifications_user_write();
