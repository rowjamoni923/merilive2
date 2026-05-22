CREATE OR REPLACE FUNCTION public.tg_app_sync_helper_upgrade_requests()
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
    'helper_upgrade_requests',
    TG_OP,
    COALESCE(NEW.id, OLD.id)::text,
    jsonb_build_object('helper_id', COALESCE(NEW.helper_id, OLD.helper_id), 'status', COALESCE(NEW.status, OLD.status))
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS tg_app_sync_helper_upgrade_requests ON public.helper_upgrade_requests;
CREATE TRIGGER tg_app_sync_helper_upgrade_requests
AFTER INSERT OR UPDATE OR DELETE ON public.helper_upgrade_requests
FOR EACH ROW EXECUTE FUNCTION public.tg_app_sync_helper_upgrade_requests();