CREATE OR REPLACE FUNCTION public.broadcast_notice_to_users()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_record RECORD;
  v_message text;
  v_data jsonb;
  v_is_helper_audience boolean;
BEGIN
  IF COALESCE(NEW.is_active, true) IS NOT TRUE THEN
    RETURN NEW;
  END IF;

  v_is_helper_audience := (
    'helpers' = ANY(NEW.target_audience)
    OR 'level5_helpers' = ANY(NEW.target_audience)
    OR 'agencies' = ANY(NEW.target_audience)
  );

  IF v_is_helper_audience AND NEW.message NOT LIKE '%payroll-helper-guide%' THEN
    v_message := NEW.message || E'\n\nPayroll Helper Guide: /payroll-helper-guide';
  ELSE
    v_message := NEW.message;
  END IF;

  FOR v_user_record IN
    SELECT DISTINCT target.user_id
    FROM (
      SELECT p.id AS user_id
      FROM public.profiles p
      WHERE COALESCE(p.is_deleted, false) = false
        AND (
          'all' = ANY(NEW.target_audience)
          OR ('users' = ANY(NEW.target_audience) AND COALESCE(p.is_host, false) = false)
          OR ('hosts' = ANY(NEW.target_audience) AND COALESCE(p.is_host, false) = true)
        )

      UNION

      SELECT a.owner_id AS user_id
      FROM public.agencies a
      WHERE 'agencies' = ANY(NEW.target_audience)
        AND COALESCE(a.is_active, true) = true
        AND a.owner_id IS NOT NULL

      UNION

      SELECT th.user_id
      FROM public.topup_helpers th
      WHERE 'helpers' = ANY(NEW.target_audience)
        AND COALESCE(th.is_verified, false) = true

      UNION

      SELECT th.user_id
      FROM public.topup_helpers th
      WHERE 'level5_helpers' = ANY(NEW.target_audience)
        AND COALESCE(th.is_verified, false) = true
        AND th.trader_level = 5
    ) target
    WHERE target.user_id IS NOT NULL
  LOOP
    v_data := jsonb_build_object(
      'notice_id', NEW.id,
      'priority', NEW.priority,
      'target_audience', NEW.target_audience,
      'image_url', NEW.image_url,
      'action_url', CASE WHEN v_is_helper_audience THEN '/payroll-helper-guide' ELSE '/chat?tab=official' END
    );

    INSERT INTO public.notifications (user_id, type, title, message, data, is_read, created_at)
    VALUES (v_user_record.user_id, 'admin_message', NEW.title, v_message, v_data, false, now());
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_broadcast_notice ON public.admin_notices;
CREATE TRIGGER trigger_broadcast_notice
AFTER INSERT ON public.admin_notices
FOR EACH ROW
EXECUTE FUNCTION public.broadcast_notice_to_users();