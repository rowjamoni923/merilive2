
-- VPN detection logs table
CREATE TABLE public.vpn_detection_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id),
  ip_address TEXT NOT NULL,
  is_vpn BOOLEAN DEFAULT false,
  is_proxy BOOLEAN DEFAULT false,
  is_tor BOOLEAN DEFAULT false,
  is_relay BOOLEAN DEFAULT false,
  country_code TEXT,
  city TEXT,
  isp TEXT,
  detection_source TEXT DEFAULT 'vpnapi.io',
  raw_response JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.vpn_detection_logs ENABLE ROW LEVEL SECURITY;

-- Only service role can insert (edge function)
CREATE POLICY "Service role can manage vpn logs"
  ON public.vpn_detection_logs
  FOR ALL
  USING (false);

-- Admin can view vpn logs
CREATE POLICY "Admins can view vpn logs"
  ON public.vpn_detection_logs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM admin_users
      WHERE user_id = auth.uid()
      AND is_active = true
    )
  );

-- Index for quick lookups
CREATE INDEX idx_vpn_logs_user_id ON public.vpn_detection_logs(user_id);
CREATE INDEX idx_vpn_logs_is_vpn ON public.vpn_detection_logs(is_vpn) WHERE is_vpn = true;
CREATE INDEX idx_vpn_logs_created_at ON public.vpn_detection_logs(created_at DESC);
