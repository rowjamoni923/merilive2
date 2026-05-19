
CREATE TABLE IF NOT EXISTS public.swift_pay_topups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  package_id uuid,
  coins_amount integer NOT NULL,
  price_usd numeric(12,2) NOT NULL,
  pay_currency text NOT NULL,
  pay_network text,
  pay_address text,
  pay_amount numeric(24,8),
  external_user_id text NOT NULL,
  payment_id text,
  idempotency_key text UNIQUE NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','paid','credited','expired','failed')),
  expires_at timestamptz,
  paid_at timestamptz,
  credited_at timestamptz,
  last_polled_at timestamptz,
  poll_attempts integer NOT NULL DEFAULT 0,
  raw_payload jsonb,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS swift_pay_topups_user_idx ON public.swift_pay_topups (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS swift_pay_topups_status_idx ON public.swift_pay_topups (status, created_at);
CREATE INDEX IF NOT EXISTS swift_pay_topups_external_idx ON public.swift_pay_topups (external_user_id);

ALTER TABLE public.swift_pay_topups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own swift_pay topups"
  ON public.swift_pay_topups FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Admin session full access on swift_pay_topups"
  ON public.swift_pay_topups FOR ALL
  USING (is_active_admin_session())
  WITH CHECK (is_active_admin_session());

CREATE OR REPLACE FUNCTION public.tg_swift_pay_topups_touch()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS swift_pay_topups_touch ON public.swift_pay_topups;
CREATE TRIGGER swift_pay_topups_touch
  BEFORE UPDATE ON public.swift_pay_topups
  FOR EACH ROW EXECUTE FUNCTION public.tg_swift_pay_topups_touch();
