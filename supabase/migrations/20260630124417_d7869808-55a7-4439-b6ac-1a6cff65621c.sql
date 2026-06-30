
-- Provider config (one row per provider)
CREATE TABLE IF NOT EXISTS public.otp_provider_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL UNIQUE,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  priority INTEGER NOT NULL DEFAULT 100,
  daily_quota INTEGER,
  daily_sent INTEGER NOT NULL DEFAULT 0,
  last_reset_date DATE NOT NULL DEFAULT CURRENT_DATE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.otp_provider_config TO authenticated;
GRANT ALL ON public.otp_provider_config TO service_role;

ALTER TABLE public.otp_provider_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins view otp providers"
  ON public.otp_provider_config FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Service role manages otp providers"
  ON public.otp_provider_config FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- Single-row orchestrator settings
CREATE TABLE IF NOT EXISTS public.otp_orchestrator_settings (
  id BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id = TRUE),
  mode TEXT NOT NULL DEFAULT 'race' CHECK (mode IN ('race', 'sequential')),
  per_provider_timeout_ms INTEGER NOT NULL DEFAULT 4000,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.otp_orchestrator_settings TO authenticated;
GRANT ALL ON public.otp_orchestrator_settings TO service_role;

ALTER TABLE public.otp_orchestrator_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins view orchestrator settings"
  ON public.otp_orchestrator_settings FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Service role manages orchestrator settings"
  ON public.otp_orchestrator_settings FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

INSERT INTO public.otp_orchestrator_settings (id, mode, per_provider_timeout_ms)
VALUES (TRUE, 'race', 4000) ON CONFLICT (id) DO NOTHING;

-- Seed three providers
INSERT INTO public.otp_provider_config (provider, enabled, priority, daily_quota, notes) VALUES
  ('resend', TRUE, 1, NULL, 'Primary: merilive.com verified, best deliverability'),
  ('brevo',  TRUE, 2, 290,  'Secondary: 300/day free quota — buffer 10'),
  ('gmail',  TRUE, 3, 450,  'Fallback: Gmail SMTP — ~500/day soft limit, buffer 50')
ON CONFLICT (provider) DO NOTHING;

-- Index on email_send_log for fast dashboard queries
CREATE INDEX IF NOT EXISTS idx_email_send_log_otp_created
  ON public.email_send_log (created_at DESC)
  WHERE template_name = 'otp-code';

-- Admin RPC: reset daily quota counters (called by cron or admin button)
CREATE OR REPLACE FUNCTION public.reset_otp_provider_daily_counters()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.otp_provider_config
  SET daily_sent = 0, last_reset_date = CURRENT_DATE, updated_at = now()
  WHERE last_reset_date < CURRENT_DATE;
END;
$$;

-- Admin RPC: increment provider counter (called by edge function via service role)
CREATE OR REPLACE FUNCTION public.increment_otp_provider_sent(_provider TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Reset if day rolled over
  UPDATE public.otp_provider_config
  SET daily_sent = 0, last_reset_date = CURRENT_DATE
  WHERE provider = _provider AND last_reset_date < CURRENT_DATE;
  -- Increment
  UPDATE public.otp_provider_config
  SET daily_sent = daily_sent + 1, updated_at = now()
  WHERE provider = _provider;
END;
$$;

GRANT EXECUTE ON FUNCTION public.increment_otp_provider_sent(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.reset_otp_provider_daily_counters() TO service_role, authenticated;
