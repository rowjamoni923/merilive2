CREATE OR REPLACE FUNCTION public.check_notification_preference()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _category TEXT;
  _enabled BOOLEAN;
BEGIN
  _category := CASE
    WHEN NEW.type IN ('gift', 'gift_received', 'gift_sent') THEN 'gifts'
    WHEN NEW.type IN ('call_missed', 'call_received') THEN 'calls'
    WHEN NEW.type IN ('new_follower', 'follow') THEN 'social'
    WHEN NEW.type IN ('live_started', 'party_invite', 'room_joined') THEN 'live'
    WHEN NEW.type IN ('coins_added', 'coin_purchase_helper', 'coin_purchase_direct', 'topup_approved', 'topup_rejected', 'diamonds_credited', 'coins_received', 'payment_completed') THEN 'transactions'
    WHEN NEW.type IN ('withdrawal', 'withdrawal_approved', 'withdrawal_rejected') THEN 'transactions'
    WHEN NEW.type IN ('level_up', 'reward', 'task_completed', 'daily_bonus') THEN 'rewards'
    WHEN NEW.type IN ('admin_message', 'admin_message_reply', 'system', 'security') THEN 'system'
    WHEN NEW.type IN ('beans_exchanged', 'balance_deducted', 'coin_exchange', 'diamond_sent') THEN 'transactions'
    WHEN NEW.type LIKE 'agency_%' THEN 'agency'
    WHEN NEW.type LIKE 'helper_%' OR NEW.type IN ('payroll_approved', 'payroll_rejected', 'new_topup_order', 'order_completed') THEN 'helper'
    WHEN NEW.type IN ('host_approved', 'host_rejected', 'host_application') THEN 'host'
    WHEN NEW.type IN ('face_verification_approved','face_verification_rejected','face_verification_removed','face_verification_needs_retry','face_verification_retry') THEN 'verification_critical'
    ELSE 'general'
  END;

  IF _category = 'verification_critical' THEN
    RETURN NEW;
  END IF;

  SELECT enabled INTO _enabled
  FROM public.notification_preferences
  WHERE user_id = NEW.user_id AND category = _category;

  IF _enabled IS NOT NULL AND _enabled = false THEN
    RETURN NULL;
  END IF;

  RETURN NEW;
END;
$function$;