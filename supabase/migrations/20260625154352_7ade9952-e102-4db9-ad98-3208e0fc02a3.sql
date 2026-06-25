
-- suppressed_emails: blocked recipients (bounces/complaints/unsubscribes)
CREATE TABLE IF NOT EXISTS public.suppressed_emails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  reason text NOT NULL DEFAULT 'manual',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS suppressed_emails_email_idx ON public.suppressed_emails(lower(email));
GRANT SELECT ON public.suppressed_emails TO authenticated;
GRANT ALL ON public.suppressed_emails TO service_role;
ALTER TABLE public.suppressed_emails ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service role manages suppressed_emails" ON public.suppressed_emails;
CREATE POLICY "service role manages suppressed_emails" ON public.suppressed_emails FOR ALL TO service_role USING (true) WITH CHECK (true);

-- email_send_log: append-only delivery log
CREATE TABLE IF NOT EXISTS public.email_send_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id text,
  template_name text,
  recipient_email text,
  status text NOT NULL,
  error_message text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS email_send_log_message_id_idx ON public.email_send_log(message_id);
CREATE INDEX IF NOT EXISTS email_send_log_created_at_idx ON public.email_send_log(created_at DESC);
GRANT SELECT ON public.email_send_log TO authenticated;
GRANT ALL ON public.email_send_log TO service_role;
ALTER TABLE public.email_send_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service role manages email_send_log" ON public.email_send_log;
CREATE POLICY "service role manages email_send_log" ON public.email_send_log FOR ALL TO service_role USING (true) WITH CHECK (true);

-- email_unsubscribe_tokens: one token per email
CREATE TABLE IF NOT EXISTS public.email_unsubscribe_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  token text NOT NULL UNIQUE,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.email_unsubscribe_tokens TO service_role;
ALTER TABLE public.email_unsubscribe_tokens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service role manages email_unsubscribe_tokens" ON public.email_unsubscribe_tokens;
CREATE POLICY "service role manages email_unsubscribe_tokens" ON public.email_unsubscribe_tokens FOR ALL TO service_role USING (true) WITH CHECK (true);

-- email_send_state: single-row throughput/config
CREATE TABLE IF NOT EXISTS public.email_send_state (
  id int PRIMARY KEY DEFAULT 1,
  batch_size int NOT NULL DEFAULT 10,
  send_delay_ms int NOT NULL DEFAULT 500,
  auth_ttl_seconds int NOT NULL DEFAULT 900,
  transactional_ttl_seconds int NOT NULL DEFAULT 3600,
  retry_after_until timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT email_send_state_singleton CHECK (id = 1)
);
INSERT INTO public.email_send_state (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
GRANT ALL ON public.email_send_state TO service_role;
ALTER TABLE public.email_send_state ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service role manages email_send_state" ON public.email_send_state;
CREATE POLICY "service role manages email_send_state" ON public.email_send_state FOR ALL TO service_role USING (true) WITH CHECK (true);
