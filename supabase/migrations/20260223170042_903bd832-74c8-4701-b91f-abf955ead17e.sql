
-- Security Alerts Table
-- Stores real-time security events for admin monitoring
CREATE TABLE public.security_alerts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  alert_type text NOT NULL, -- 'session_hijack', 'brute_force', 'suspicious_transfer', 'vpn_detected', 'device_banned', 'multiple_accounts', 'rapid_login'
  severity text NOT NULL DEFAULT 'medium', -- 'low', 'medium', 'high', 'critical'
  user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ip_address text,
  device_info jsonb,
  description text NOT NULL,
  metadata jsonb DEFAULT '{}',
  is_resolved boolean DEFAULT false,
  resolved_by uuid,
  resolved_at timestamptz,
  resolution_notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.security_alerts ENABLE ROW LEVEL SECURITY;

-- Only admins can view security alerts
CREATE POLICY "Admins can view security alerts"
ON public.security_alerts
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.admin_users
    WHERE admin_users.user_id = auth.uid() AND admin_users.is_active = true
  )
);

-- Only admins can update (resolve) alerts
CREATE POLICY "Admins can resolve security alerts"
ON public.security_alerts
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.admin_users
    WHERE admin_users.user_id = auth.uid() AND admin_users.is_active = true
  )
);

-- System can insert alerts (via service role or RPC)
CREATE POLICY "Authenticated users can create alerts"
ON public.security_alerts
FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);

-- Indexes for fast querying
CREATE INDEX idx_security_alerts_type ON public.security_alerts (alert_type);
CREATE INDEX idx_security_alerts_severity ON public.security_alerts (severity) WHERE is_resolved = false;
CREATE INDEX idx_security_alerts_created ON public.security_alerts (created_at DESC);
CREATE INDEX idx_security_alerts_user ON public.security_alerts (user_id) WHERE user_id IS NOT NULL;

-- RPC function to raise a security alert from client
CREATE OR REPLACE FUNCTION public.raise_security_alert(
  p_alert_type text,
  p_severity text,
  p_description text,
  p_ip_address text DEFAULT NULL,
  p_device_info jsonb DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_alert_id uuid;
BEGIN
  INSERT INTO public.security_alerts (
    alert_type, severity, user_id, ip_address, device_info, description, metadata
  ) VALUES (
    p_alert_type, p_severity, auth.uid(), p_ip_address, p_device_info, p_description, p_metadata
  )
  RETURNING id INTO v_alert_id;

  -- Also create an admin notification for high/critical alerts
  IF p_severity IN ('high', 'critical') THEN
    INSERT INTO public.notifications (user_id, type, title, message, metadata)
    SELECT au.user_id, 'security_alert',
      '🚨 Security Alert: ' || p_alert_type,
      p_description,
      jsonb_build_object('alert_id', v_alert_id, 'severity', p_severity)
    FROM public.admin_users au
    WHERE au.is_active = true AND au.role IN ('owner', 'super_admin')
    AND au.user_id IS NOT NULL;
  END IF;

  RETURN v_alert_id;
END;
$$;

-- Enable realtime for security_alerts
ALTER PUBLICATION supabase_realtime ADD TABLE public.security_alerts;
ALTER TABLE public.security_alerts REPLICA IDENTITY FULL;

-- Auto-cleanup old resolved alerts (>30 days)
CREATE OR REPLACE FUNCTION public.cleanup_old_security_alerts()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.security_alerts
  WHERE is_resolved = true AND resolved_at < now() - interval '30 days';
END;
$$;
