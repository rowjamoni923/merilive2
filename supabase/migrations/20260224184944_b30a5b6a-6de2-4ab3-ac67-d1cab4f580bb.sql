
-- Function to notify all active admin users
CREATE OR REPLACE FUNCTION public.notify_admin_users(
  p_title TEXT,
  p_message TEXT,
  p_type TEXT,
  p_data JSONB DEFAULT '{}'::JSONB
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  admin_record RECORD;
BEGIN
  FOR admin_record IN 
    SELECT user_id FROM admin_users WHERE is_active = true AND user_id IS NOT NULL
  LOOP
    INSERT INTO notifications (user_id, title, message, type, data, is_read, created_at)
    VALUES (admin_record.user_id, p_title, p_message, p_type, p_data, false, now());
  END LOOP;
END;
$$;

-- Trigger: New agency withdrawal request
CREATE OR REPLACE FUNCTION public.trigger_admin_notify_withdrawal()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  agency_name TEXT;
BEGIN
  SELECT name INTO agency_name FROM agencies WHERE id = NEW.agency_id;
  PERFORM notify_admin_users(
    '💰 New Withdrawal Request',
    'Agency ' || COALESCE(agency_name, 'Unknown') || ' requested $' || NEW.amount || ' withdrawal',
    'agency_withdrawal',
    jsonb_build_object('withdrawal_id', NEW.id, 'agency_id', NEW.agency_id, 'amount', NEW.amount)
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_admin_notify_withdrawal ON agency_withdrawals;
CREATE TRIGGER trg_admin_notify_withdrawal
  AFTER INSERT ON agency_withdrawals
  FOR EACH ROW
  EXECUTE FUNCTION trigger_admin_notify_withdrawal();

-- Trigger: New helper application
CREATE OR REPLACE FUNCTION public.trigger_admin_notify_helper_application()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  applicant_name TEXT;
BEGIN
  SELECT display_name INTO applicant_name FROM profiles WHERE id = NEW.user_id;
  PERFORM notify_admin_users(
    '🙋 New Helper Application',
    COALESCE(applicant_name, 'A user') || ' applied to become a helper',
    'helper_application',
    jsonb_build_object('application_id', NEW.id, 'user_id', NEW.user_id)
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_admin_notify_helper_application ON helper_applications;
CREATE TRIGGER trg_admin_notify_helper_application
  AFTER INSERT ON helper_applications
  FOR EACH ROW
  EXECUTE FUNCTION trigger_admin_notify_helper_application();

-- Trigger: New helper upgrade request
CREATE OR REPLACE FUNCTION public.trigger_admin_notify_helper_upgrade()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  helper_name TEXT;
BEGIN
  SELECT p.display_name INTO helper_name 
  FROM topup_helpers th JOIN profiles p ON p.id = th.user_id 
  WHERE th.id = NEW.helper_id;
  PERFORM notify_admin_users(
    '⬆️ Helper Upgrade Request',
    COALESCE(helper_name, 'A helper') || ' requested level upgrade to ' || NEW.requested_level,
    'helper_upgrade_request',
    jsonb_build_object('request_id', NEW.id, 'helper_id', NEW.helper_id, 'requested_level', NEW.requested_level)
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_admin_notify_helper_upgrade ON helper_upgrade_requests;
CREATE TRIGGER trg_admin_notify_helper_upgrade
  AFTER INSERT ON helper_upgrade_requests
  FOR EACH ROW
  EXECUTE FUNCTION trigger_admin_notify_helper_upgrade();

-- Trigger: New helper topup request (recharge request via helper)
CREATE OR REPLACE FUNCTION public.trigger_admin_notify_helper_topup()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM notify_admin_users(
    '💎 New Recharge Request',
    'New recharge request for $' || COALESCE(NEW.amount_usd::TEXT, '0') || ' via helper',
    'helper_topup_request',
    jsonb_build_object('request_id', NEW.id, 'helper_id', NEW.helper_id, 'amount', NEW.amount_usd)
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_admin_notify_helper_topup ON helper_topup_requests;
CREATE TRIGGER trg_admin_notify_helper_topup
  AFTER INSERT ON helper_topup_requests
  FOR EACH ROW
  EXECUTE FUNCTION trigger_admin_notify_helper_topup();

-- Trigger: New face verification / host application
CREATE OR REPLACE FUNCTION public.trigger_admin_notify_face_verification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  applicant_name TEXT;
  notif_title TEXT;
  notif_type TEXT;
BEGIN
  SELECT display_name INTO applicant_name FROM profiles WHERE id = NEW.user_id;
  
  IF NEW.verification_type = 'host' THEN
    notif_title := '🎤 New Host Application';
    notif_type := 'host_application';
  ELSE
    notif_title := '🔍 New Face Verification';
    notif_type := 'verification';
  END IF;
  
  PERFORM notify_admin_users(
    notif_title,
    COALESCE(applicant_name, 'A user') || ' submitted ' || NEW.verification_type || ' verification',
    notif_type,
    jsonb_build_object('submission_id', NEW.id, 'user_id', NEW.user_id, 'type', NEW.verification_type)
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_admin_notify_face_verification ON face_verification_submissions;
CREATE TRIGGER trg_admin_notify_face_verification
  AFTER INSERT ON face_verification_submissions
  FOR EACH ROW
  EXECUTE FUNCTION trigger_admin_notify_face_verification();

-- Trigger: New support ticket
CREATE OR REPLACE FUNCTION public.trigger_admin_notify_support_ticket()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_name TEXT;
BEGIN
  SELECT display_name INTO user_name FROM profiles WHERE id = NEW.user_id;
  PERFORM notify_admin_users(
    '🎫 New Support Ticket',
    COALESCE(user_name, 'A user') || ': ' || LEFT(NEW.subject, 50),
    'support',
    jsonb_build_object('ticket_id', NEW.id, 'user_id', NEW.user_id, 'subject', NEW.subject)
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_admin_notify_support_ticket ON support_tickets;
CREATE TRIGGER trg_admin_notify_support_ticket
  AFTER INSERT ON support_tickets
  FOR EACH ROW
  EXECUTE FUNCTION trigger_admin_notify_support_ticket();

-- Trigger: New agency created
CREATE OR REPLACE FUNCTION public.trigger_admin_notify_new_agency()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM notify_admin_users(
    '🏢 New Agency Created',
    'New agency "' || NEW.name || '" (Code: ' || NEW.agency_code || ') has been created',
    'agency_created',
    jsonb_build_object('agency_id', NEW.id, 'agency_name', NEW.name, 'agency_code', NEW.agency_code)
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_admin_notify_new_agency ON agencies;
CREATE TRIGGER trg_admin_notify_new_agency
  AFTER INSERT ON agencies
  FOR EACH ROW
  EXECUTE FUNCTION trigger_admin_notify_new_agency();
