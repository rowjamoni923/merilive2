-- Pkg303 Settings deep audit: tighten public settings content and add app-sync fanout.

-- 1) App content must not expose unpublished drafts through the public API.
DROP POLICY IF EXISTS public_read ON public.app_content;
DROP POLICY IF EXISTS "Anyone can read active content" ON public.app_content;

CREATE POLICY "Published app content is readable"
ON public.app_content
FOR SELECT
TO anon, authenticated
USING (
  COALESCE(is_published, false) = true
  AND COALESCE(is_active, true) = true
);

-- 2) Block-list settings: emit app-sync events without adding these tables to realtime publication.
CREATE OR REPLACE FUNCTION public.emit_user_block_app_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid := COALESCE(NEW.blocker_id, OLD.blocker_id);
  v_blocked_id uuid := COALESCE(NEW.blocked_id, OLD.blocked_id);
  v_row_id text := COALESCE(NEW.id, OLD.id)::text;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  PERFORM public.emit_app_sync_notification(
    v_user_id,
    TG_TABLE_NAME,
    TG_OP,
    v_row_id,
    jsonb_build_object('blocked_id', v_blocked_id)
  );

  RETURN COALESCE(NEW, OLD);
END;
$function$;

DROP TRIGGER IF EXISTS user_blocks_app_sync_trg ON public.user_blocks;
CREATE TRIGGER user_blocks_app_sync_trg
AFTER INSERT OR DELETE ON public.user_blocks
FOR EACH ROW EXECUTE FUNCTION public.emit_user_block_app_sync();

DROP TRIGGER IF EXISTS blocked_users_app_sync_trg ON public.blocked_users;
CREATE TRIGGER blocked_users_app_sync_trg
AFTER INSERT OR DELETE ON public.blocked_users
FOR EACH ROW EXECUTE FUNCTION public.emit_user_block_app_sync();

-- 3) Notification settings: cross-device sync via app-sync, not polling.
CREATE OR REPLACE FUNCTION public.emit_notification_preferences_app_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid := COALESCE(NEW.user_id, OLD.user_id);
  v_row_id text := COALESCE(NEW.id, OLD.id)::text;
  v_category text := COALESCE(NEW.category, OLD.category);
BEGIN
  IF v_user_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  PERFORM public.emit_app_sync_notification(
    v_user_id,
    'notification_preferences',
    TG_OP,
    v_row_id,
    jsonb_build_object('category', v_category)
  );

  RETURN COALESCE(NEW, OLD);
END;
$function$;

DROP TRIGGER IF EXISTS notification_preferences_app_sync_trg ON public.notification_preferences;
CREATE TRIGGER notification_preferences_app_sync_trg
AFTER INSERT OR UPDATE OR DELETE ON public.notification_preferences
FOR EACH ROW EXECUTE FUNCTION public.emit_notification_preferences_app_sync();