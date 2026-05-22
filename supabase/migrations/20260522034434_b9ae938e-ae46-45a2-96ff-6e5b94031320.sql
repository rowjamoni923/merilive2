CREATE OR REPLACE FUNCTION public.tg_app_sync_user_invitations()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.emit_app_sync_notification(COALESCE(NEW.inviter_id, OLD.inviter_id), 'user_invitations', TG_OP, COALESCE(NEW.id, OLD.id)::text, '{}'::jsonb);
  PERFORM public.emit_app_sync_notification(COALESCE(NEW.invitee_id, OLD.invitee_id), 'user_invitations', TG_OP, COALESCE(NEW.id, OLD.id)::text, '{}'::jsonb);
  RETURN COALESCE(NEW, OLD);
END;
$function$;