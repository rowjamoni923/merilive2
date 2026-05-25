CREATE OR REPLACE FUNCTION public.emit_app_sync_notification(_user_id uuid, _topic text, _event text DEFAULT 'UPDATE'::text, _row_id text DEFAULT NULL::text, _extra jsonb DEFAULT '{}'::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF _user_id IS NULL OR _topic IS NULL OR _topic = '' THEN
    RETURN;
  END IF;

  -- CRITICAL: tg_guard_notifications_insert blocks 'app_sync' type for non-service callers.
  -- This function is invoked from AFTER-INSERT/UPDATE triggers on many tables under the
  -- end-user's role; without this bypass the guard raises 'restricted_notification_type'
  -- and rolls back the originating INSERT (e.g. face_verification_submissions).
  PERFORM set_config('app.bypass_profile_protection', 'true', true);

  INSERT INTO public.notifications (user_id, type, title, message, data, is_read)
  VALUES (
    _user_id,
    'app_sync',
    'Sync',
    'Sync',
    jsonb_build_object(
      'topic', _topic,
      'eventType', upper(COALESCE(_event, 'UPDATE')),
      'row_id', _row_id,
      'silent', true,
      'origin', 'app_sync_trigger'
    ) || COALESCE(_extra, '{}'::jsonb),
    true
  );
END;
$function$;