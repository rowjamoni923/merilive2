
-- Admin Login 2FA OTP Table
CREATE TABLE public.admin_login_otps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  otp_code TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  is_used BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.admin_login_otps ENABLE ROW LEVEL SECURITY;

-- No public access - only edge functions with service role can access
-- Auto-cleanup old OTPs
CREATE INDEX idx_admin_login_otps_email ON public.admin_login_otps (email, is_used, expires_at);

-- Auto-delete expired OTPs (cleanup trigger)
CREATE OR REPLACE FUNCTION public.cleanup_expired_admin_otps()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.admin_login_otps 
  WHERE expires_at < now() - interval '1 hour';
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_cleanup_admin_otps
AFTER INSERT ON public.admin_login_otps
FOR EACH STATEMENT
EXECUTE FUNCTION public.cleanup_expired_admin_otps();
