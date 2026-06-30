
-- Admin notification when a host contact-sharing violation is recorded
CREATE OR REPLACE FUNCTION public.trigger_admin_notify_host_contact_violation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _name text;
  _uid  text;
  _src  text;
BEGIN
  SELECT display_name, app_uid INTO _name, _uid FROM profiles WHERE id = NEW.host_id;
  _src := COALESCE(NEW.source_type, 'chat');

  INSERT INTO admin_notifications (type, title, message, data, priority, target_role)
  VALUES (
    'contact_violation',
    '⚠️ Number / Contact Share Detected',
    COALESCE(_name, 'Host')
      || ' (#' || COALESCE(_uid, '—') || ') shared contact info via '
      || _src
      || COALESCE(' — "' || LEFT(NEW.detected_content, 80) || '"', ''),
    jsonb_build_object(
      'violation_id',     NEW.id,
      'host_id',          NEW.host_id,
      'violation_type',   NEW.violation_type,
      'detected_pattern', NEW.detected_pattern,
      'detected_content', NEW.detected_content,
      'source_type',      NEW.source_type,
      'violation_number', NEW.violation_number,
      'beans_deducted',   NEW.beans_deducted,
      'display_name',     _name,
      'app_uid',          _uid
    ),
    CASE WHEN COALESCE(NEW.violation_number, 0) >= 5 THEN 'high' ELSE 'medium' END,
    'all'
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_admin_notify_host_contact_violation ON public.host_contact_violations;
CREATE TRIGGER trg_admin_notify_host_contact_violation
AFTER INSERT ON public.host_contact_violations
FOR EACH ROW EXECUTE FUNCTION public.trigger_admin_notify_host_contact_violation();


-- Admin notification when AI moderation flags chat-share violations
CREATE OR REPLACE FUNCTION public.trigger_admin_notify_chat_moderation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _name text;
  _uid  text;
  _vt   text := COALESCE(NEW.violation_type, '');
BEGIN
  -- Skip noisy "user_report" entries and pure allows
  IF _vt = '' OR _vt = 'user_report' OR _vt = 'allow' THEN
    RETURN NEW;
  END IF;

  IF NEW.user_id IS NOT NULL THEN
    SELECT display_name, app_uid INTO _name, _uid FROM profiles WHERE id = NEW.user_id;
  END IF;

  INSERT INTO admin_notifications (type, title, message, data, priority, target_role)
  VALUES (
    'chat_violation',
    '⚠️ Chat Violation: ' || _vt,
    COALESCE(_name, 'User')
      || ' (#' || COALESCE(_uid, '—') || ') — '
      || COALESCE(LEFT(NEW.original_content, 100), '(no content)')
      || ' | action: ' || COALESCE(NEW.action_taken, 'logged'),
    jsonb_build_object(
      'log_id',           NEW.id,
      'user_id',          NEW.user_id,
      'violation_type',   NEW.violation_type,
      'original_content', NEW.original_content,
      'action_taken',     NEW.action_taken,
      'display_name',     _name,
      'app_uid',          _uid
    ),
    'medium',
    'all'
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_admin_notify_chat_moderation ON public.chat_moderation_logs;
CREATE TRIGGER trg_admin_notify_chat_moderation
AFTER INSERT ON public.chat_moderation_logs
FOR EACH ROW EXECUTE FUNCTION public.trigger_admin_notify_chat_moderation();
