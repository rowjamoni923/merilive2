
-- Email OTP table for storing verification codes
CREATE TABLE public.email_otps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  otp_code TEXT NOT NULL,
  purpose TEXT NOT NULL DEFAULT 'login',
  is_used BOOLEAN NOT NULL DEFAULT false,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '5 minutes')
);

-- Index for fast lookup
CREATE INDEX idx_email_otps_email_purpose ON public.email_otps (email, purpose, is_used, expires_at);

-- Index for cleanup
CREATE INDEX idx_email_otps_expires ON public.email_otps (expires_at);

-- Enable RLS
ALTER TABLE public.email_otps ENABLE ROW LEVEL SECURITY;

-- No direct client access - only edge functions (service role) can access
-- This ensures OTPs cannot be read or manipulated from the client

-- Auto-cleanup: delete expired OTPs older than 1 hour
CREATE OR REPLACE FUNCTION public.cleanup_expired_otps()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.email_otps 
  WHERE expires_at < now() - interval '1 hour';
END;
$$;

-- Rate limiting function: max 5 OTP requests per email per 10 minutes
CREATE OR REPLACE FUNCTION public.check_otp_rate_limit(p_email TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  recent_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO recent_count
  FROM public.email_otps
  WHERE email = p_email
    AND created_at > now() - interval '10 minutes';
  
  RETURN recent_count < 5;
END;
$$;
