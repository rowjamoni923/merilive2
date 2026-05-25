ALTER TABLE public.email_otps
  ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS verified_at timestamptz;

ALTER TABLE public.password_reset_otps
  ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS verified_at timestamptz;

ALTER TABLE public.phone_otps
  ADD COLUMN IF NOT EXISTS verified_at timestamptz;

DROP POLICY IF EXISTS email_otps_own_read ON public.email_otps;
DROP POLICY IF EXISTS password_otps_own_read ON public.password_reset_otps;
DROP POLICY IF EXISTS phone_otps_own_read ON public.phone_otps;

CREATE INDEX IF NOT EXISTS idx_email_otps_rate_limit
  ON public.email_otps (email, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_password_reset_otps_rate_limit
  ON public.password_reset_otps (email, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_phone_otps_rate_limit
  ON public.phone_otps (phone_number, created_at DESC);