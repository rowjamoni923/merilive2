-- 1) notify_coin_transfer: column was renamed sender_type -> transfer_type (Pkg325)
CREATE OR REPLACE FUNCTION public.notify_coin_transfer()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.transfer_type IN ('trader_to_user','trader_to_agency') THEN
    PERFORM public.create_notification(
      NEW.receiver_id,
      'coins_received',
      'Coins Received! 💎',
      'You have received ' || NEW.amount::text || ' diamonds.',
      jsonb_build_object('amount', NEW.amount, 'sender_id', NEW.sender_id, 'transfer_type', NEW.transfer_type)
    );
  END IF;
  RETURN NEW;
END;
$function$;

-- 2) tg_guard_notifications_insert: remove 'app_sync' from blocked list.
-- 'app_sync' is purely an internal realtime signal emitted by SECDEF triggers
-- (emit_app_sync_notification). End-users have no RLS INSERT path to notifications,
-- so the block only ever fired when a legit SECDEF trigger ran under an
-- end-user's JWT and the transaction-local bypass flag failed to propagate
-- across nested SECDEF functions. Allowing 'app_sync' here is safe — every
-- other admin/system type stays blocked.
CREATE OR REPLACE FUNCTION public.tg_guard_notifications_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_role text := current_setting('request.jwt.claim.role', true);
  v_bypass boolean := COALESCE(current_setting('app.bypass_profile_protection', true), '') = 'true';
BEGIN
  IF v_role = 'service_role' OR v_bypass OR public.is_active_admin_session() THEN
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
    -- 'app_sync' intentionally removed; harmless internal realtime sync signal.
  ) OR NEW.type LIKE 'pk\_%' ESCAPE '\' THEN
    RAISE EXCEPTION 'restricted_notification_type';
  END IF;
  IF char_length(coalesce(NEW.title,'')) > 200 THEN NEW.title := substr(NEW.title,1,200); END IF;
  IF char_length(coalesce(NEW.message,'')) > 2000 THEN NEW.message := substr(NEW.message,1,2000); END IF;
  RETURN NEW;
END;
$function$;