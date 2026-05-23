
-- 1) Face-verification bucket: make private + drop public read policy
UPDATE storage.buckets SET public = false WHERE id = 'face-verification';
DROP POLICY IF EXISTS "public_read_face_verification" ON storage.objects;

-- 2) account_deletion_requests: restrict insert
DROP POLICY IF EXISTS "Anyone can submit deletion request" ON public.account_deletion_requests;
CREATE POLICY "Authenticated users submit own deletion request"
  ON public.account_deletion_requests
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );

-- 3) live_streams: revoke column-level access to sensitive credential columns
REVOKE SELECT (stream_key, rtmp_url, ingress_id, live_password_hash)
  ON public.live_streams FROM anon, authenticated;
-- Hosts/admins fetch credentials via existing SECURITY DEFINER RPC get_live_stream_ingress

-- 4) topup_helpers: revoke column-level access to payment_credentials
REVOKE SELECT (payment_credentials)
  ON public.topup_helpers FROM anon, authenticated;
-- Admins read via service-role client; helpers can fetch own via RPC if needed later

-- 5) Realtime: restrict per-topic subscriptions to row owner
-- Enable RLS on realtime.messages (idempotent)
ALTER TABLE IF EXISTS realtime.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users subscribe to own notification/session topics" ON realtime.messages;
CREATE POLICY "Users subscribe to own notification/session topics"
  ON realtime.messages
  FOR SELECT
  TO authenticated
  USING (
    -- Allow only topics that match the user's own uid for the published tables.
    -- Topics published from postgres_changes are of the form 'realtime:<schema>:<table>'
    -- and we additionally gate user-scoped channels on the uid suffix used by the client.
    (
      realtime.topic() LIKE 'notifications:' || auth.uid()::text || '%'
      OR realtime.topic() LIKE 'user_active_sessions:' || auth.uid()::text || '%'
      OR realtime.topic() LIKE 'user:' || auth.uid()::text || '%'
    )
  );
