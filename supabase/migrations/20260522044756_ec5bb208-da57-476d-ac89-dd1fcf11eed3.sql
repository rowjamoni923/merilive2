CREATE OR REPLACE FUNCTION public.tg_app_sync_helper_notifications()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_helper_user uuid;
BEGIN
  SELECT user_id INTO v_helper_user
  FROM public.topup_helpers
  WHERE id = COALESCE(NEW.helper_id, OLD.helper_id);

  PERFORM public.emit_app_sync_notification(
    v_helper_user,
    'helper_notifications',
    TG_OP,
    COALESCE(NEW.id, OLD.id)::text,
    jsonb_build_object('helper_id', COALESCE(NEW.helper_id, OLD.helper_id))
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS tg_app_sync_helper_notifications ON public.helper_notifications;
CREATE TRIGGER tg_app_sync_helper_notifications
AFTER INSERT OR UPDATE OR DELETE ON public.helper_notifications
FOR EACH ROW EXECUTE FUNCTION public.tg_app_sync_helper_notifications();

CREATE OR REPLACE FUNCTION public.tg_app_sync_helper_withdrawal_requests()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_helper_user uuid;
BEGIN
  SELECT user_id INTO v_helper_user
  FROM public.topup_helpers
  WHERE id = COALESCE(NEW.helper_id, OLD.helper_id);

  PERFORM public.emit_app_sync_notification(
    v_helper_user,
    'helper_withdrawal_requests',
    TG_OP,
    COALESCE(NEW.id, OLD.id)::text,
    jsonb_build_object('helper_id', COALESCE(NEW.helper_id, OLD.helper_id))
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS tg_app_sync_helper_withdrawal_requests ON public.helper_withdrawal_requests;
CREATE TRIGGER tg_app_sync_helper_withdrawal_requests
AFTER INSERT OR UPDATE OR DELETE ON public.helper_withdrawal_requests
FOR EACH ROW EXECUTE FUNCTION public.tg_app_sync_helper_withdrawal_requests();

CREATE OR REPLACE FUNCTION public.tg_app_sync_helper_admin_messages()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_helper_user uuid;
BEGIN
  SELECT user_id INTO v_helper_user
  FROM public.topup_helpers
  WHERE id = COALESCE(NEW.helper_id, OLD.helper_id);

  PERFORM public.emit_app_sync_notification(
    v_helper_user,
    'helper_admin_messages',
    TG_OP,
    COALESCE(NEW.id, OLD.id)::text,
    jsonb_build_object('helper_id', COALESCE(NEW.helper_id, OLD.helper_id))
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS tg_app_sync_helper_admin_messages ON public.helper_admin_messages;
CREATE TRIGGER tg_app_sync_helper_admin_messages
AFTER INSERT OR UPDATE OR DELETE ON public.helper_admin_messages
FOR EACH ROW EXECUTE FUNCTION public.tg_app_sync_helper_admin_messages();

CREATE OR REPLACE FUNCTION public.tg_app_sync_helper_message_replies()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_message_id uuid;
  v_helper_id uuid;
  v_helper_user uuid;
BEGIN
  v_message_id := COALESCE(NEW.message_id, OLD.message_id);

  SELECT ham.helper_id, th.user_id
  INTO v_helper_id, v_helper_user
  FROM public.helper_admin_messages ham
  JOIN public.topup_helpers th ON th.id = ham.helper_id
  WHERE ham.id = v_message_id;

  PERFORM public.emit_app_sync_notification(
    v_helper_user,
    'helper_message_replies',
    TG_OP,
    COALESCE(NEW.id, OLD.id)::text,
    jsonb_build_object('helper_id', v_helper_id, 'message_id', v_message_id)
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS tg_app_sync_helper_message_replies ON public.helper_message_replies;
CREATE TRIGGER tg_app_sync_helper_message_replies
AFTER INSERT OR UPDATE OR DELETE ON public.helper_message_replies
FOR EACH ROW EXECUTE FUNCTION public.tg_app_sync_helper_message_replies();