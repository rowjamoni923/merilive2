
-- Fix broadcast_notice_to_users trigger function - use is_host = true instead of gender check
CREATE OR REPLACE FUNCTION public.broadcast_notice_to_users()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_record RECORD;
BEGIN
  IF NOT NEW.is_active THEN
    RETURN NEW;
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
$function$;

-- Fix get_user_notices RPC - use is_host = true instead of gender check
CREATE OR REPLACE FUNCTION public.get_user_notices(p_user_id uuid)
 RETURNS SETOF admin_notices
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_is_host BOOLEAN := FALSE;
  v_is_agency BOOLEAN := FALSE;
  v_is_helper BOOLEAN := FALSE;
  v_is_level5_helper BOOLEAN := FALSE;
  v_audiences TEXT[];
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = p_user_id
    AND is_host = true
  ) INTO v_is_host;

  SELECT EXISTS (
    SELECT 1 FROM agencies
    WHERE owner_id = p_user_id
    AND is_active = true
  ) INTO v_is_agency;

  SELECT EXISTS (
    SELECT 1 FROM topup_helpers
    WHERE user_id = p_user_id
    AND is_verified = true
  ) INTO v_is_helper;

  SELECT EXISTS (
    SELECT 1 FROM topup_helpers
    WHERE user_id = p_user_id
    AND is_verified = true
    AND trader_level = 5
  ) INTO v_is_level5_helper;

  v_audiences := ARRAY['all', 'users'];
  
  IF v_is_host THEN
    v_audiences := array_append(v_audiences, 'hosts');
  END IF;
  
  IF v_is_agency THEN
    v_audiences := array_append(v_audiences, 'agencies');
  END IF;
  
  IF v_is_helper THEN
    v_audiences := array_append(v_audiences, 'helpers');
  END IF;
  
  IF v_is_level5_helper THEN
    v_audiences := array_append(v_audiences, 'level5_helpers');
  END IF;

  RETURN QUERY
  SELECT an.*
  FROM admin_notices an
  WHERE an.is_active = true
    AND (an.expires_at IS NULL OR an.expires_at > now())
    AND an.target_audience && v_audiences
  ORDER BY 
    CASE an.priority 
      WHEN 'urgent' THEN 1 
      WHEN 'high' THEN 2 
      WHEN 'normal' THEN 3 
      ELSE 4 
    END,
    an.created_at DESC;
END;
$function$;
