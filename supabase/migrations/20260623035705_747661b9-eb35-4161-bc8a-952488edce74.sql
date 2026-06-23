
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
               OR current_user = 'service_role';

  IF v_is_service OR v_bypass OR public.is_active_admin_session() THEN
    IF char_length(coalesce(NEW.title,'')) > 200 THEN NEW.title := substr(NEW.title,1,200); END IF;
    IF char_length(coalesce(NEW.message,'')) > 2000 THEN NEW.message := substr(NEW.message,1,2000); END IF;
    RETURN NEW;
  END IF;

  IF NEW.type IS NULL THEN RAISE EXCEPTION 'invalid_type'; END IF;
  IF NEW.type IN (
    'incoming_call','call_received','call_missed',
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
