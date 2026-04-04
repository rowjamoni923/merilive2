CREATE OR REPLACE FUNCTION public.notify_admin_users(p_title text, p_message text, p_type text, p_data jsonb DEFAULT '{}'::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  admin_record RECORD;
BEGIN
  FOR admin_record IN 
    SELECT au.user_id FROM admin_users au 
    WHERE au.is_active = true 
      AND au.user_id IS NOT NULL
      AND EXISTS (SELECT 1 FROM profiles p WHERE p.id = au.user_id)
  LOOP
    INSERT INTO notifications (user_id, title, message, type, data, is_read, created_at)
    VALUES (admin_record.user_id, p_title, p_message, p_type, p_data, false, now());
  END LOOP;
END;
$function$;