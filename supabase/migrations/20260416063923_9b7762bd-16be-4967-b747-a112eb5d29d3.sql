DROP POLICY IF EXISTS "u_read_hlp_notif" ON public.helper_notifications;
DROP POLICY IF EXISTS "u_update_hlp_notif" ON public.helper_notifications;

CREATE POLICY "u_read_hlp_notif"
ON public.helper_notifications
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.topup_helpers th
    WHERE th.id = helper_notifications.helper_id
      AND th.user_id = auth.uid()
  )
);

CREATE POLICY "u_update_hlp_notif"
ON public.helper_notifications
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.topup_helpers th
    WHERE th.id = helper_notifications.helper_id
      AND th.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.topup_helpers th
    WHERE th.id = helper_notifications.helper_id
      AND th.user_id = auth.uid()
  )
);