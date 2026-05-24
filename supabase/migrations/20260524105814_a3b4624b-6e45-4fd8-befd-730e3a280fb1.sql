CREATE TABLE IF NOT EXISTS public.otp_exchange_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash text NOT NULL UNIQUE,
  identifier text NOT NULL,
  channel text NOT NULL CHECK (channel IN ('email', 'phone')),
  purpose text NOT NULL DEFAULT 'login',
  is_used boolean NOT NULL DEFAULT false,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.otp_exchange_tokens ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_otp_exchange_tokens_lookup
  ON public.otp_exchange_tokens (identifier, channel, purpose, is_used, expires_at);

ALTER TABLE public.phone_otps
  ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0;