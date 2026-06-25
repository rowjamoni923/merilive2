
-- 1) Map face verification notification types to their OWN category so
--    user-level preferences (general/system) can never suppress them.
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
    -- 🔒 Face verification + account-action notices are CRITICAL — non-suppressible.
    WHEN NEW.type IN (
      'face_verification_approved',
      'face_verification_rejected',
      'face_verification_removed',
      'face_verification_needs_retry'
    ) THEN 'verification_critical'
    ELSE 'general'
  END;

  -- verification_critical is never suppressible
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

-- 2) Strengthen `auto_finalize_face_verification` so manual review (and any caller)
--    ALWAYS produces:
--      • a profile UPDATE that includes updated_at (guarantees realtime fires)
--      • an explicit profile-side status signal on both approve and reject
--      • a notification row that the FCM trigger can deliver (the dedicated
--        tg_notify_face_verification_status trigger dedupes within 30s)
CREATE OR REPLACE FUNCTION public.auto_finalize_face_verification(
  _submission_id uuid,
  _action text,
  _approve_as text DEFAULT 'user'::text,
  _set_gender text DEFAULT NULL::text,
  _reason text DEFAULT NULL::text,
  _tags text[] DEFAULT NULL::text[]
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _submission RECORD;
  _gender_value text;
BEGIN
  SELECT * INTO _submission FROM face_verification_submissions WHERE id = _submission_id;
  IF NOT FOUND THEN RETURN FALSE; END IF;

  _gender_value := COALESCE(_set_gender, CASE WHEN _approve_as = 'host' THEN 'female' ELSE 'male' END);

  IF _action = 'approve' THEN
    UPDATE face_verification_submissions
       SET status = 'approved',
           verification_type = _approve_as,
           reviewed_at = now(),
           admin_notes = COALESCE(_reason, admin_notes),
           updated_at = now()
     WHERE id = _submission_id;

    UPDATE profiles
       SET is_verified             = true,
           is_face_verified        = true,
           face_verification_image = _submission.face_image_url,
           face_verified_at        = now(),
           is_host                 = (_approve_as = 'host'),
           host_status             = CASE WHEN _approve_as = 'host' THEN 'approved' ELSE NULL END,
           gender                  = _gender_value,
           updated_at              = now()
     WHERE id = _submission.user_id;

  ELSIF _action = 'reject' THEN
    UPDATE face_verification_submissions
       SET status = 'rejected',
           reviewed_at = now(),
           rejection_reason = COALESCE(_reason, rejection_reason),
           updated_at = now()
     WHERE id = _submission_id;

    UPDATE profiles
       SET is_face_verified        = false,
           face_verification_image = NULL,
           face_verified_at        = NULL,
           updated_at              = now()
     WHERE id = _submission.user_id;
  ELSE
    RETURN FALSE;
  END IF;

  -- Notification row is produced by `tg_notify_face_verification_status` on the
  -- submissions UPDATE above (handles BOTH auto and manual paths with a 30s
  -- dedupe), and the `trigger_push_on_notification` trigger fans out an FCM push.
  -- No direct INSERT here — the trigger path is the single source of truth.

  RETURN TRUE;
END;
$function$;
