
-- Session security tracking table
CREATE TABLE public.session_security_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  session_id TEXT,
  ip_address TEXT,
  user_agent TEXT,
  device_fingerprint TEXT,
  event_type TEXT NOT NULL, -- 'session_start', 'ip_change', 'device_change', 'suspicious_activity', 'forced_logout'
  risk_level TEXT DEFAULT 'low', -- 'low', 'medium', 'high', 'critical'
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for fast user lookups
CREATE INDEX idx_session_security_user ON public.session_security_logs (user_id, created_at DESC);
CREATE INDEX idx_session_security_event ON public.session_security_logs (event_type, created_at DESC);

-- Enable RLS
ALTER TABLE public.session_security_logs ENABLE ROW LEVEL SECURITY;

-- Users can view their own logs
CREATE POLICY "Users can view own session logs"
ON public.session_security_logs FOR SELECT
USING (auth.uid() = user_id);

-- Insert via service role or authenticated user for own data
CREATE POLICY "Users can insert own session logs"
ON public.session_security_logs FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Function to check session integrity
CREATE OR REPLACE FUNCTION public.validate_session_integrity(
  p_user_id UUID,
  p_device_fingerprint TEXT,
  p_ip_address TEXT,
  p_user_agent TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_last_session RECORD;
  v_risk_level TEXT := 'low';
  v_alerts JSONB := '[]'::jsonb;
  v_is_suspicious BOOLEAN := false;
BEGIN
  -- Get the last session record for this user
  SELECT * INTO v_last_session
  FROM public.session_security_logs
  WHERE user_id = p_user_id
    AND event_type = 'session_start'
  ORDER BY created_at DESC
  LIMIT 1;

  -- If we have a previous session, compare
  IF v_last_session IS NOT NULL THEN
    -- Check device fingerprint change
    IF v_last_session.device_fingerprint IS NOT NULL 
       AND v_last_session.device_fingerprint != p_device_fingerprint THEN
      v_risk_level := 'high';
      v_is_suspicious := true;
      v_alerts := v_alerts || jsonb_build_object(
        'type', 'device_change',
        'message', 'Different device detected',
        'previous', v_last_session.device_fingerprint,
        'current', p_device_fingerprint
      );
    END IF;

    -- Check IP address change
    IF v_last_session.ip_address IS NOT NULL 
       AND v_last_session.ip_address != p_ip_address THEN
      -- IP change alone is medium risk
      IF v_risk_level = 'low' THEN
        v_risk_level := 'medium';
      ELSE
        v_risk_level := 'critical'; -- Both device and IP changed
      END IF;
      v_is_suspicious := true;
      v_alerts := v_alerts || jsonb_build_object(
        'type', 'ip_change',
        'message', 'IP address changed',
        'previous', v_last_session.ip_address,
        'current', p_ip_address
      );
    END IF;

    -- Check user agent change (browser/OS)
    IF v_last_session.user_agent IS NOT NULL 
       AND v_last_session.user_agent != p_user_agent THEN
      IF v_risk_level = 'low' THEN
        v_risk_level := 'medium';
      END IF;
      v_alerts := v_alerts || jsonb_build_object(
        'type', 'ua_change',
        'message', 'Browser or OS changed',
        'previous', v_last_session.user_agent,
        'current', p_user_agent
      );
    END IF;
  END IF;

  -- Log this session
  INSERT INTO public.session_security_logs (
    user_id, device_fingerprint, ip_address, user_agent,
    event_type, risk_level, details
  ) VALUES (
    p_user_id, p_device_fingerprint, p_ip_address, p_user_agent,
    CASE WHEN v_is_suspicious THEN 'suspicious_activity' ELSE 'session_start' END,
    v_risk_level,
    jsonb_build_object('alerts', v_alerts)
  );

  -- If critical risk, also notify admins
  IF v_risk_level = 'critical' THEN
    INSERT INTO public.admin_logs (action_type, target_type, target_id, details)
    VALUES ('security_alert', 'user', p_user_id::text, jsonb_build_object(
      'type', 'session_hijack_suspect',
      'risk_level', v_risk_level,
      'ip_address', p_ip_address,
      'alerts', v_alerts
    ));
  END IF;

  RETURN jsonb_build_object(
    'valid', NOT (v_risk_level = 'critical'),
    'risk_level', v_risk_level,
    'is_suspicious', v_is_suspicious,
    'alerts', v_alerts,
    'action', CASE 
      WHEN v_risk_level = 'critical' THEN 'force_logout'
      WHEN v_risk_level = 'high' THEN 'require_verification'
      WHEN v_risk_level = 'medium' THEN 'warn'
      ELSE 'allow'
    END
  );
END;
$$;
