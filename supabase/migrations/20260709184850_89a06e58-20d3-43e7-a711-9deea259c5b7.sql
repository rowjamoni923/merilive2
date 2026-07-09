CREATE TABLE public.google_play_purchase_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  product_id text NOT NULL,
  google_order_id text,
  purchase_token_hash text NOT NULL,
  purchase_token_suffix text,
  requested_order_id text,
  status text NOT NULL DEFAULT 'received',
  error_code text,
  error_message text,
  google_purchase_state integer,
  amount_usd numeric,
  coins_amount integer,
  currency_code text DEFAULT 'USD',
  recharge_transaction_id uuid,
  raw_google_response jsonb DEFAULT '{}'::jsonb,
  client_context jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.google_play_purchase_attempts TO anon, authenticated;
GRANT ALL ON public.google_play_purchase_attempts TO service_role;

ALTER TABLE public.google_play_purchase_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin sessions can view google purchase attempts"
ON public.google_play_purchase_attempts
FOR SELECT
TO public
USING (public.is_active_admin_session());

CREATE POLICY "Admin sessions can manage google purchase attempts"
ON public.google_play_purchase_attempts
FOR ALL
TO public
USING (public.is_active_admin_session())
WITH CHECK (public.is_active_admin_session());

CREATE INDEX idx_google_play_purchase_attempts_user_created
ON public.google_play_purchase_attempts(user_id, created_at DESC);

CREATE INDEX idx_google_play_purchase_attempts_status_created
ON public.google_play_purchase_attempts(status, created_at DESC);

CREATE INDEX idx_google_play_purchase_attempts_order
ON public.google_play_purchase_attempts(google_order_id)
WHERE google_order_id IS NOT NULL AND google_order_id <> '';

CREATE UNIQUE INDEX uniq_google_play_purchase_attempts_token
ON public.google_play_purchase_attempts(purchase_token_hash);

CREATE TRIGGER set_updated_at_google_play_purchase_attempts
BEFORE UPDATE ON public.google_play_purchase_attempts
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();