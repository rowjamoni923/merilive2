
-- Pkg349 Notif / Email / Support lockdown

-- 1. admin_notices
DROP POLICY IF EXISTS "Admin session full access" ON public.admin_notices;
DROP POLICY IF EXISTS "Admins can manage notices" ON public.admin_notices;
DROP POLICY IF EXISTS "Only admins can manage notices" ON public.admin_notices;
CREATE POLICY pkg349_admin_notices_admin_select ON public.admin_notices FOR SELECT USING (is_active_admin_session());
CREATE POLICY pkg349_admin_notices_admin_write ON public.admin_notices FOR ALL
  USING (admin_has_any_section_permission(ARRAY['notices','broadcast','notifications','push-notifications','content-hub'], true))
  WITH CHECK (admin_has_any_section_permission(ARRAY['notices','broadcast','notifications','push-notifications','content-hub'], true));

-- 2. admin_notifications
DROP POLICY IF EXISTS "Admin session full access" ON public.admin_notifications;
CREATE POLICY pkg349_admin_notifications_admin_select ON public.admin_notifications FOR SELECT USING (is_active_admin_session());
CREATE POLICY pkg349_admin_notifications_admin_write ON public.admin_notifications FOR ALL
  USING (admin_has_any_section_permission(ARRAY['notifications','broadcast','push-notifications','support','support-hub'], true))
  WITH CHECK (admin_has_any_section_permission(ARRAY['notifications','broadcast','push-notifications','support','support-hub'], true));

-- 3. notification_templates
DROP POLICY IF EXISTS "Admin session full access" ON public.notification_templates;
DROP POLICY IF EXISTS "Admins can manage notification templates" ON public.notification_templates;
CREATE POLICY pkg349_notification_templates_admin_select ON public.notification_templates FOR SELECT USING (is_active_admin_session());
CREATE POLICY pkg349_notification_templates_admin_write ON public.notification_templates FOR ALL
  USING (admin_has_any_section_permission(ARRAY['notifications','notification-templates','email-templates','broadcast','push-notifications','content-hub'], true))
  WITH CHECK (admin_has_any_section_permission(ARRAY['notifications','notification-templates','email-templates','broadcast','push-notifications','content-hub'], true));

-- 4. notification_preferences (admin SELECT only)
DROP POLICY IF EXISTS "Admin session full access" ON public.notification_preferences;
CREATE POLICY pkg349_notification_preferences_admin_select ON public.notification_preferences FOR SELECT USING (is_active_admin_session());

-- 5. notifications (admin SELECT only)
DROP POLICY IF EXISTS "Admin session full access" ON public.notifications;
CREATE POLICY pkg349_notifications_admin_select ON public.notifications FOR SELECT USING (is_active_admin_session());

-- 6. room_welcome_messages
DROP POLICY IF EXISTS "Admin session full access" ON public.room_welcome_messages;
DROP POLICY IF EXISTS "Admins can manage welcome messages" ON public.room_welcome_messages;
CREATE POLICY pkg349_room_welcome_messages_admin_select ON public.room_welcome_messages FOR SELECT USING (is_active_admin_session());
CREATE POLICY pkg349_room_welcome_messages_admin_write ON public.room_welcome_messages FOR ALL
  USING (admin_has_any_section_permission(ARRAY['room-welcome','notifications','party-rooms','content-hub','streams'], true))
  WITH CHECK (admin_has_any_section_permission(ARRAY['room-welcome','notifications','party-rooms','content-hub','streams'], true));

-- 7. support_categories
DROP POLICY IF EXISTS "Admin session full access" ON public.support_categories;
DROP POLICY IF EXISTS "Admins manage support categories" ON public.support_categories;
CREATE POLICY pkg349_support_categories_admin_select ON public.support_categories FOR SELECT USING (is_active_admin_session());
CREATE POLICY pkg349_support_categories_admin_write ON public.support_categories FOR ALL
  USING (admin_has_any_section_permission(ARRAY['support','support-hub','support-tickets','moderation-hub','content-hub'], true))
  WITH CHECK (admin_has_any_section_permission(ARRAY['support','support-hub','support-tickets','moderation-hub','content-hub'], true));

-- 8. admin_send_notification RPC perm-gate (DROP+CREATE to allow signature/default rewrite)
DROP FUNCTION IF EXISTS public.admin_send_notification(uuid, text, text, text, jsonb);

CREATE FUNCTION public.admin_send_notification(
  _user_id uuid,
  _title text,
  _message text,
  _type text,
  _data jsonb
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_notification_id uuid;
  v_is_service boolean;
BEGIN
  v_is_service := current_setting('request.jwt.claim.role', true) = 'service_role';
  IF NOT v_is_service
     AND NOT admin_has_any_section_permission(
       ARRAY['broadcast','push-notifications','notifications','support','support-hub','moderation-hub','user-management'],
       true
     ) THEN
    RAISE EXCEPTION 'Unauthorized: admin broadcast/notifications permission required' USING ERRCODE = '42501';
  END IF;

  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'user_id required';
  END IF;
  IF length(coalesce(_title,'')) = 0 OR length(_title) > 200 THEN
    RAISE EXCEPTION 'title must be 1..200 chars';
  END IF;
  IF length(coalesce(_message,'')) = 0 OR length(_message) > 2000 THEN
    RAISE EXCEPTION 'message must be 1..2000 chars';
  END IF;

  INSERT INTO public.notifications (user_id, title, message, type, data, is_read, created_at)
  VALUES (_user_id, _title, _message, COALESCE(_type, 'admin_message'), COALESCE(_data, '{}'::jsonb), false, now())
  RETURNING id INTO v_notification_id;

  RETURN v_notification_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_send_notification(uuid, text, text, text, jsonb)
  TO anon, authenticated, service_role;
