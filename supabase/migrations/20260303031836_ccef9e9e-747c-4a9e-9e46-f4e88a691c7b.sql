
-- Create phone_otps table for WhatsApp OTP verification
CREATE TABLE IF NOT EXISTS public.phone_otps (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  phone_number TEXT NOT NULL,
  otp_code TEXT NOT NULL,
  is_used BOOLEAN DEFAULT false,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.phone_otps ENABLE ROW LEVEL SECURITY;

-- Only service role can access (edge function uses service role key)
-- No public policies needed since this is server-side only

-- Index for quick lookups
CREATE INDEX IF NOT EXISTS idx_phone_otps_phone ON public.phone_otps (phone_number, is_used);
CREATE INDEX IF NOT EXISTS idx_phone_otps_expires ON public.phone_otps (expires_at);
