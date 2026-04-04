
-- Create a function that sends notifications to targeted users when a notice is created
CREATE OR REPLACE FUNCTION public.broadcast_notice_to_users()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_record RECORD;
  v_target_query TEXT;
BEGIN
  -- Only process on insert of active notices
  IF NOT NEW.is_active THEN
    RETURN NEW;
  END IF;

  -- Build a query to find all targeted users based on audience
  FOR v_user_record IN
    SELECT DISTINCT p.id AS user_id
    FROM profiles p
    WHERE (
      -- 'all' targets everyone
      'all' = ANY(NEW.target_audience)
      -- 'users' targets all registered users
      OR 'users' = ANY(NEW.target_audience)
      -- 'hosts' targets female verified hosts
      OR ('hosts' = ANY(NEW.target_audience) AND p.gender = 'Female' AND p.is_verified = true)
    )
    
    UNION
    
    -- Agency owners
    SELECT DISTINCT a.owner_id AS user_id
    FROM agencies a
    WHERE 'agencies' = ANY(NEW.target_audience)
      AND a.is_active = true
      AND a.owner_id IS NOT NULL
    
    UNION
    
    -- All helpers
    SELECT DISTINCT th.user_id
    FROM topup_helpers th
    WHERE 'helpers' = ANY(NEW.target_audience)
      AND th.is_verified = true
    
    UNION
    
    -- Level 5 helpers
    SELECT DISTINCT th.user_id
    FROM topup_helpers th
    WHERE 'level5_helpers' = ANY(NEW.target_audience)
      AND th.is_verified = true
      AND th.trader_level = 5
  LOOP
    INSERT INTO notifications (user_id, type, title, message, data, is_read)
    VALUES (
      v_user_record.user_id,
      'admin_message',
      NEW.title,
      NEW.message,
      jsonb_build_object(
        'notice_id', NEW.id,
        'priority', NEW.priority,
        'target_audience', NEW.target_audience
      ),
      false
    )
    ON CONFLICT DO NOTHING;
  END LOOP;

  RETURN NEW;
END;
$$;

-- Create the trigger
DROP TRIGGER IF EXISTS trigger_broadcast_notice ON admin_notices;
CREATE TRIGGER trigger_broadcast_notice
  AFTER INSERT ON admin_notices
  FOR EACH ROW
  EXECUTE FUNCTION broadcast_notice_to_users();
