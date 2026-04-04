
-- Update broadcast_notice_to_users to auto-include Payroll Helper Guide link for helpers/agencies
CREATE OR REPLACE FUNCTION public.broadcast_notice_to_users()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_record RECORD;
  v_is_helper_audience BOOLEAN;
  v_message TEXT;
  v_data JSONB;
  v_counter INT := 0;
BEGIN
  IF NOT NEW.is_active THEN
    RETURN NEW;
  END IF;

  -- Check if targeting helpers or agencies
  v_is_helper_audience := (
    'helpers' = ANY(NEW.target_audience) OR 
    'level5_helpers' = ANY(NEW.target_audience) OR 
    'agencies' = ANY(NEW.target_audience)
  );

  -- Auto-append Payroll Helper Guide link for helper/agency audiences
  IF v_is_helper_audience AND NEW.message NOT LIKE '%payroll-helper-guide%' THEN
    v_message := NEW.message || E'\n\n📖 Payroll Helper Guide: /payroll-helper-guide';
  ELSE
    v_message := NEW.message;
  END IF;

  FOR v_user_record IN
    SELECT DISTINCT p.id AS user_id
    FROM profiles p
    WHERE (
      'all' = ANY(NEW.target_audience)
      OR 'users' = ANY(NEW.target_audience)
      OR ('hosts' = ANY(NEW.target_audience) AND p.is_host = true)
    )
    
    UNION
    
    SELECT DISTINCT a.owner_id AS user_id
    FROM agencies a
    WHERE 'agencies' = ANY(NEW.target_audience)
      AND a.is_active = true
      AND a.owner_id IS NOT NULL
    
    UNION
    
    SELECT DISTINCT th.user_id
    FROM topup_helpers th
    WHERE 'helpers' = ANY(NEW.target_audience)
      AND th.is_verified = true
    
    UNION
    
    SELECT DISTINCT th.user_id
    FROM topup_helpers th
    WHERE 'level5_helpers' = ANY(NEW.target_audience)
      AND th.is_verified = true
      AND th.trader_level = 5
  LOOP
    v_counter := v_counter + 1;
    
    -- Build data with action_url for helper/agency audiences
    v_data := jsonb_build_object(
      'notice_id', NEW.id,
      'priority', NEW.priority,
      'target_audience', NEW.target_audience,
      'serial_number', v_counter
    );
    
    IF v_is_helper_audience THEN
      v_data := v_data || jsonb_build_object('action_url', '/payroll-helper-guide');
    END IF;

    INSERT INTO notifications (user_id, type, title, message, data, is_read)
    VALUES (
      v_user_record.user_id,
      'admin_message',
      NEW.title,
      v_message,
      v_data,
      false
    )
    ON CONFLICT DO NOTHING;
  END LOOP;

  RETURN NEW;
END;
$function$;
