-- Pkg83-instant: invisible user-app sync over the already-approved notifications realtime channel.
-- No new Supabase Realtime tables/channels; notifications is already whitelisted.

CREATE OR REPLACE FUNCTION public.trigger_push_on_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_url text := 'https://ayjdlvuurscxucatbbah.supabase.co/functions/v1/send-push-notification';
  v_image text;
  v_type text;
BEGIN
  -- Pkg83-instant: app_sync rows are foreground invalidation signals only.
  -- They must never create FCM push noise and are hidden by the app.
  IF NEW.type = 'app_sync' THEN
    RETURN NEW;
  END IF;

  -- Pkg84: incoming_call rows are inserted by call-deliver edge function purely for in-app
  -- foreground delivery (via useNotifications realtime). The edge function ALREADY sent a
  -- high-priority data-only FCM specifically formatted for the native call screen UI.
  -- Skipping the generic push here prevents a duplicate, generic notification banner from
  -- firing on top of the proper call invite.
  IF NEW.type = 'incoming_call' THEN
    RETURN NEW;
  END IF;

  v_image := NULLIF(NEW.data->>'imageUrl', '');
  IF v_image IS NULL THEN
    v_image := NULLIF(NEW.data->>'image_url', '');
  END IF;
  v_type := COALESCE(NULLIF(NEW.data->>'type',''), NEW.type, 'general');

  PERFORM net.http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := jsonb_build_object(
      'userId', NEW.user_id,
      'title', NEW.title,
      'body', NEW.message,
      'imageUrl', v_image,
      'type', v_type,
      'data', COALESCE(NEW.data, '{}'::jsonb) || jsonb_build_object(
        'notification_id', NEW.id,
        'origin', 'notifications_trigger',
        'persist_fallback', false
      )
    )
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'trigger_push_on_notification failed: %', SQLERRM;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.emit_app_sync_notification(
  _user_id uuid,
  _topic text,
  _event text DEFAULT 'UPDATE',
  _row_id text DEFAULT NULL,
  _extra jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF _user_id IS NULL OR _topic IS NULL OR _topic = '' THEN
    RETURN;
  END IF;

  INSERT INTO public.notifications (user_id, type, title, message, data, is_read)
  VALUES (
    _user_id,
    'app_sync',
    'Sync',
    'Sync',
    jsonb_build_object(
      'topic', _topic,
      'eventType', upper(COALESCE(_event, 'UPDATE')),
      'row_id', _row_id,
      'silent', true,
      'origin', 'app_sync_trigger'
    ) || COALESCE(_extra, '{}'::jsonb),
    true
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.tg_app_sync_agencies()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.emit_app_sync_notification(
    COALESCE(NEW.owner_id, OLD.owner_id),
    'agencies',
    TG_OP,
    COALESCE(NEW.id, OLD.id)::text,
    jsonb_build_object('agency_id', COALESCE(NEW.id, OLD.id))
  );
  RETURN COALESCE(NEW, OLD);
END;
$function$;

DROP TRIGGER IF EXISTS tg_app_sync_agencies ON public.agencies;
CREATE TRIGGER tg_app_sync_agencies
AFTER INSERT OR UPDATE OR DELETE ON public.agencies
FOR EACH ROW EXECUTE FUNCTION public.tg_app_sync_agencies();

CREATE OR REPLACE FUNCTION public.tg_app_sync_agency_hosts()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_agency_owner uuid;
BEGIN
  SELECT owner_id INTO v_agency_owner
  FROM public.agencies
  WHERE id = COALESCE(NEW.agency_id, OLD.agency_id);

  PERFORM public.emit_app_sync_notification(
    v_agency_owner,
    'agency_hosts',
    TG_OP,
    COALESCE(NEW.id, OLD.id)::text,
    jsonb_build_object('agency_id', COALESCE(NEW.agency_id, OLD.agency_id), 'host_id', COALESCE(NEW.host_id, OLD.host_id))
  );

  IF COALESCE(NEW.host_id, OLD.host_id) IS DISTINCT FROM v_agency_owner THEN
    PERFORM public.emit_app_sync_notification(
      COALESCE(NEW.host_id, OLD.host_id),
      'agency_hosts',
      TG_OP,
      COALESCE(NEW.id, OLD.id)::text,
      jsonb_build_object('agency_id', COALESCE(NEW.agency_id, OLD.agency_id), 'host_id', COALESCE(NEW.host_id, OLD.host_id))
    );
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$function$;

DROP TRIGGER IF EXISTS tg_app_sync_agency_hosts ON public.agency_hosts;
CREATE TRIGGER tg_app_sync_agency_hosts
AFTER INSERT OR UPDATE OR DELETE ON public.agency_hosts
FOR EACH ROW EXECUTE FUNCTION public.tg_app_sync_agency_hosts();

CREATE OR REPLACE FUNCTION public.tg_app_sync_agency_withdrawals()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_agency_owner uuid;
BEGIN
  SELECT owner_id INTO v_agency_owner
  FROM public.agencies
  WHERE id = COALESCE(NEW.agency_id, OLD.agency_id);

  PERFORM public.emit_app_sync_notification(
    v_agency_owner,
    'agency_withdrawals',
    TG_OP,
    COALESCE(NEW.id, OLD.id)::text,
    jsonb_build_object('agency_id', COALESCE(NEW.agency_id, OLD.agency_id), 'status', COALESCE(NEW.status, OLD.status))
  );

  RETURN COALESCE(NEW, OLD);
END;
$function$;

DROP TRIGGER IF EXISTS tg_app_sync_agency_withdrawals ON public.agency_withdrawals;
CREATE TRIGGER tg_app_sync_agency_withdrawals
AFTER INSERT OR UPDATE OR DELETE ON public.agency_withdrawals
FOR EACH ROW EXECUTE FUNCTION public.tg_app_sync_agency_withdrawals();

CREATE OR REPLACE FUNCTION public.tg_app_sync_agency_earnings_transfers()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_agency_owner uuid;
BEGIN
  SELECT owner_id INTO v_agency_owner
  FROM public.agencies
  WHERE id = COALESCE(NEW.agency_id, OLD.agency_id);

  PERFORM public.emit_app_sync_notification(
    COALESCE(NEW.host_id, OLD.host_id),
    'agency_earnings_transfers',
    TG_OP,
    COALESCE(NEW.id, OLD.id)::text,
    jsonb_build_object('agency_id', COALESCE(NEW.agency_id, OLD.agency_id))
  );

  PERFORM public.emit_app_sync_notification(
    v_agency_owner,
    'agency_earnings_transfers',
    TG_OP,
    COALESCE(NEW.id, OLD.id)::text,
    jsonb_build_object('agency_id', COALESCE(NEW.agency_id, OLD.agency_id))
  );

  RETURN COALESCE(NEW, OLD);
END;
$function$;

DROP TRIGGER IF EXISTS tg_app_sync_agency_earnings_transfers ON public.agency_earnings_transfers;
CREATE TRIGGER tg_app_sync_agency_earnings_transfers
AFTER INSERT OR UPDATE OR DELETE ON public.agency_earnings_transfers
FOR EACH ROW EXECUTE FUNCTION public.tg_app_sync_agency_earnings_transfers();

CREATE OR REPLACE FUNCTION public.tg_app_sync_coin_transfers()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.emit_app_sync_notification(
    COALESCE(NEW.sender_id, OLD.sender_id),
    'coin_transfers',
    TG_OP,
    COALESCE(NEW.id, OLD.id)::text,
    jsonb_build_object('amount', COALESCE(NEW.amount, OLD.amount))
  );
  PERFORM public.emit_app_sync_notification(
    COALESCE(NEW.receiver_id, OLD.receiver_id),
    'coin_transfers',
    TG_OP,
    COALESCE(NEW.id, OLD.id)::text,
    jsonb_build_object('amount', COALESCE(NEW.amount, OLD.amount))
  );
  RETURN COALESCE(NEW, OLD);
END;
$function$;

DROP TRIGGER IF EXISTS tg_app_sync_coin_transfers ON public.coin_transfers;
CREATE TRIGGER tg_app_sync_coin_transfers
AFTER INSERT OR UPDATE OR DELETE ON public.coin_transfers
FOR EACH ROW EXECUTE FUNCTION public.tg_app_sync_coin_transfers();

CREATE OR REPLACE FUNCTION public.tg_app_sync_followers()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.emit_app_sync_notification(COALESCE(NEW.follower_id, OLD.follower_id), 'followers', TG_OP, COALESCE(NEW.id, OLD.id)::text, '{}'::jsonb);
  PERFORM public.emit_app_sync_notification(COALESCE(NEW.following_id, OLD.following_id), 'followers', TG_OP, COALESCE(NEW.id, OLD.id)::text, '{}'::jsonb);
  RETURN COALESCE(NEW, OLD);
END;
$function$;

DROP TRIGGER IF EXISTS tg_app_sync_followers ON public.followers;
CREATE TRIGGER tg_app_sync_followers
AFTER INSERT OR UPDATE OR DELETE ON public.followers
FOR EACH ROW EXECUTE FUNCTION public.tg_app_sync_followers();

CREATE OR REPLACE FUNCTION public.tg_app_sync_user_invitations()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.emit_app_sync_notification(COALESCE(NEW.inviter_id, OLD.inviter_id), 'user_invitations', TG_OP, COALESCE(NEW.id, OLD.id)::text, '{}'::jsonb);
  PERFORM public.emit_app_sync_notification(COALESCE(NEW.invited_id, OLD.invited_id), 'user_invitations', TG_OP, COALESCE(NEW.id, OLD.id)::text, '{}'::jsonb);
  RETURN COALESCE(NEW, OLD);
END;
$function$;

DROP TRIGGER IF EXISTS tg_app_sync_user_invitations ON public.user_invitations;
CREATE TRIGGER tg_app_sync_user_invitations
AFTER INSERT OR UPDATE OR DELETE ON public.user_invitations
FOR EACH ROW EXECUTE FUNCTION public.tg_app_sync_user_invitations();

CREATE OR REPLACE FUNCTION public.tg_app_sync_invitation_reward_claims()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.emit_app_sync_notification(COALESCE(NEW.claimed_by, OLD.claimed_by), 'invitation_reward_claims', TG_OP, COALESCE(NEW.id, OLD.id)::text, '{}'::jsonb);
  RETURN COALESCE(NEW, OLD);
END;
$function$;

DROP TRIGGER IF EXISTS tg_app_sync_invitation_reward_claims ON public.invitation_reward_claims;
CREATE TRIGGER tg_app_sync_invitation_reward_claims
AFTER INSERT OR UPDATE OR DELETE ON public.invitation_reward_claims
FOR EACH ROW EXECUTE FUNCTION public.tg_app_sync_invitation_reward_claims();

CREATE OR REPLACE FUNCTION public.tg_app_sync_user_task_progress()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.emit_app_sync_notification(COALESCE(NEW.user_id, OLD.user_id), 'user_task_progress', TG_OP, COALESCE(NEW.id, OLD.id)::text, '{}'::jsonb);
  RETURN COALESCE(NEW, OLD);
END;
$function$;

DROP TRIGGER IF EXISTS tg_app_sync_user_task_progress ON public.user_task_progress;
CREATE TRIGGER tg_app_sync_user_task_progress
AFTER INSERT OR UPDATE OR DELETE ON public.user_task_progress
FOR EACH ROW EXECUTE FUNCTION public.tg_app_sync_user_task_progress();

CREATE OR REPLACE FUNCTION public.tg_app_sync_user_parcels()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.emit_app_sync_notification(COALESCE(NEW.user_id, OLD.user_id), 'user_parcels', TG_OP, COALESCE(NEW.id, OLD.id)::text, '{}'::jsonb);
  RETURN COALESCE(NEW, OLD);
END;
$function$;

DROP TRIGGER IF EXISTS tg_app_sync_user_parcels ON public.user_parcels;
CREATE TRIGGER tg_app_sync_user_parcels
AFTER INSERT OR UPDATE OR DELETE ON public.user_parcels
FOR EACH ROW EXECUTE FUNCTION public.tg_app_sync_user_parcels();

CREATE OR REPLACE FUNCTION public.tg_app_sync_user_purchases()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.emit_app_sync_notification(COALESCE(NEW.user_id, OLD.user_id), 'user_purchases', TG_OP, COALESCE(NEW.id, OLD.id)::text, '{}'::jsonb);
  RETURN COALESCE(NEW, OLD);
END;
$function$;

DROP TRIGGER IF EXISTS tg_app_sync_user_purchases ON public.user_purchases;
CREATE TRIGGER tg_app_sync_user_purchases
AFTER INSERT OR UPDATE OR DELETE ON public.user_purchases
FOR EACH ROW EXECUTE FUNCTION public.tg_app_sync_user_purchases();

CREATE OR REPLACE FUNCTION public.tg_app_sync_topup_helpers()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.emit_app_sync_notification(
    COALESCE(NEW.user_id, OLD.user_id),
    'topup_helpers',
    TG_OP,
    COALESCE(NEW.id, OLD.id)::text,
    jsonb_build_object('helper_id', COALESCE(NEW.id, OLD.id))
  );
  RETURN COALESCE(NEW, OLD);
END;
$function$;

DROP TRIGGER IF EXISTS tg_app_sync_topup_helpers ON public.topup_helpers;
CREATE TRIGGER tg_app_sync_topup_helpers
AFTER INSERT OR UPDATE OR DELETE ON public.topup_helpers
FOR EACH ROW EXECUTE FUNCTION public.tg_app_sync_topup_helpers();

CREATE OR REPLACE FUNCTION public.tg_app_sync_helper_orders()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_helper_user uuid;
BEGIN
  SELECT user_id INTO v_helper_user
  FROM public.topup_helpers
  WHERE id = COALESCE(NEW.helper_id, OLD.helper_id);

  PERFORM public.emit_app_sync_notification(
    v_helper_user,
    'helper_orders',
    TG_OP,
    COALESCE(NEW.id, OLD.id)::text,
    jsonb_build_object('helper_id', COALESCE(NEW.helper_id, OLD.helper_id))
  );
  PERFORM public.emit_app_sync_notification(
    COALESCE(NEW.user_id, OLD.user_id),
    'helper_orders',
    TG_OP,
    COALESCE(NEW.id, OLD.id)::text,
    jsonb_build_object('helper_id', COALESCE(NEW.helper_id, OLD.helper_id))
  );

  RETURN COALESCE(NEW, OLD);
END;
$function$;

DROP TRIGGER IF EXISTS tg_app_sync_helper_orders ON public.helper_orders;
CREATE TRIGGER tg_app_sync_helper_orders
AFTER INSERT OR UPDATE OR DELETE ON public.helper_orders
FOR EACH ROW EXECUTE FUNCTION public.tg_app_sync_helper_orders();