-- Pillar A: Allow service-role edge functions to insert system-only call notifications.
-- Root cause: tg_guard_notifications_insert listed 'incoming_call', 'call_received', 'call_missed'
-- in the restricted list. The service-role bypass path was not firing reliably for the
-- call-deliver edge function (auth context propagation differs across PostgREST versions),
-- so every in-app foreground incoming-call ring was being silently blocked with
-- 'restricted_notification_type'. RLS on public.notifications already prevents end users
-- from inserting any rows directly, so these types are safe to remove from the guard list.

CREATE OR REPLACE FUNCTION public.tg_guard_notifications_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_role_legacy text := current_setting('request.jwt.claim.role', true);
  v_claims_raw text := current_setting('request.jwt.claims', true);
  v_role_new text := NULL;
  v_bypass boolean := COALESCE(current_setting('app.bypass_profile_protection', true), '') = 'true';
  v_is_service boolean := false;
  v_auth uuid := auth.uid();
BEGIN
  IF v_claims_raw IS NOT NULL AND v_claims_raw <> '' THEN
    BEGIN
      v_role_new := (v_claims_raw::jsonb) ->> 'role';
    EXCEPTION WHEN OTHERS THEN
      v_role_new := NULL;
    END;
  END IF;

  v_is_service := v_role_legacy = 'service_role'
               OR v_role_new = 'service_role'
               OR session_user = 'service_role'
               OR current_user = 'service_role'
               OR v_auth IS NULL;

  IF v_is_service OR v_bypass OR public.is_active_admin_session() THEN
    IF char_length(coalesce(NEW.title,'')) > 200 THEN NEW.title := substr(NEW.title,1,200); END IF;
    IF char_length(coalesce(NEW.message,'')) > 2000 THEN NEW.message := substr(NEW.message,1,2000); END IF;
    RETURN NEW;
  END IF;

  IF NEW.type IS NULL THEN RAISE EXCEPTION 'invalid_type'; END IF;

  -- Restricted list — system-only notification types that should never be inserted
  -- by an authenticated end user. The three call types (incoming_call/call_received/
  -- call_missed) were REMOVED so the call-deliver edge function can deliver them
  -- to the recipient's foreground in-app ring. RLS on notifications already blocks
  -- user-direct inserts, so this remains safe.
  IF NEW.type IN (
    'admin_message','admin_message_reply','admin_notice','admin_warning',
    'system','security','report_resolved',
    'topup_approved','topup_rejected','withdrawal_approved','withdrawal_rejected',
    'level_upgrade_approved','level_upgrade_rejected','helper_approved','helper_rejected',
    'payroll_approved','payroll_rejected','host_approved','host_rejected',
    'gift_received','gift','coins_added','coins_received','coin_purchase_helper',
    'coin_purchase_direct','diamonds_credited','payment_completed','beans_exchanged',
    'agency_approved','agency_verification','agency_withdrawal_approved','agency_diamond_received',
    'welcome_bonus'
  ) OR NEW.type LIKE 'pk\_%' ESCAPE '\' THEN
    RAISE EXCEPTION 'restricted_notification_type';
  END IF;

  IF char_length(coalesce(NEW.title,'')) > 200 THEN NEW.title := substr(NEW.title,1,200); END IF;
  IF char_length(coalesce(NEW.message,'')) > 2000 THEN NEW.message := substr(NEW.message,1,2000); END IF;
  RETURN NEW;
END;
$function$;