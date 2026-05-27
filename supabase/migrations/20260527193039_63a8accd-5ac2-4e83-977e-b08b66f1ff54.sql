DROP POLICY IF EXISTS helper_admin_message_attachments_read ON storage.objects;

CREATE POLICY helper_admin_message_attachments_read
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'chat-media'
  AND (storage.foldername(name))[1] = 'helper-messages'
  AND EXISTS (
    SELECT 1
    FROM public.helper_admin_messages ham
    JOIN public.topup_helpers th ON th.id = ham.helper_id
    WHERE th.user_id = auth.uid()
      AND th.trader_level = 5
      AND th.payroll_enabled = true
      AND th.is_active = true
      AND jsonb_typeof(ham.attachments) = 'array'
      AND EXISTS (
        SELECT 1
        FROM jsonb_array_elements_text(ham.attachments) AS att(url)
        WHERE att.url = storage.objects.name
           OR att.url = 'chat-media/' || storage.objects.name
           OR att.url LIKE '%/chat-media/' || storage.objects.name || '%'
           OR att.url LIKE '%/object/public/chat-media/' || storage.objects.name || '%'
           OR att.url LIKE '%/object/sign/chat-media/' || storage.objects.name || '%'
      )
  )
);