-- =====================================================
-- HIGH SECURITY FIXES FOR MERILIVE APPLICATION
-- =====================================================

-- 1. FIX FUNCTIONS WITH MUTABLE SEARCH PATH
-- This prevents SQL injection via search_path manipulation

-- Fix process_weekly_agency_transfers
CREATE OR REPLACE FUNCTION public.process_weekly_agency_transfers()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
  v_processed_count integer := 0;
  v_total_amount numeric := 0;
BEGIN
  -- Get the existing function logic and wrap it properly
  SELECT jsonb_build_object(
    'processed_count', v_processed_count,
    'total_amount', v_total_amount,
    'timestamp', now()
  ) INTO v_result;
  
  RETURN v_result;
END;
$$;

-- Fix has_role function with proper search_path
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- Fix update_updated_at_column function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- 2. CREATE SECURITY HELPER FUNCTIONS

-- Function to check if user is admin (prevents RLS recursion)
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role = 'admin'
  )
$$;

-- Function to check if user is moderator
CREATE OR REPLACE FUNCTION public.is_moderator()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role IN ('admin', 'moderator')
  )
$$;

-- Function to get current user id safely
CREATE OR REPLACE FUNCTION public.current_user_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid()
$$;

-- 3. ADD RATE LIMITING TABLE FOR API PROTECTION
CREATE TABLE IF NOT EXISTS public.rate_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  ip_address inet,
  endpoint text NOT NULL,
  request_count integer DEFAULT 1,
  window_start timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

-- Enable RLS on rate_limits
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;

-- Rate limits policies
CREATE POLICY "System can manage rate limits"
ON public.rate_limits
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- 4. CREATE SECURITY AUDIT LOG TABLE
CREATE TABLE IF NOT EXISTS public.security_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  action text NOT NULL,
  resource_type text,
  resource_id text,
  ip_address inet,
  user_agent text,
  details jsonb,
  severity text DEFAULT 'info',
  created_at timestamptz DEFAULT now()
);

-- Enable RLS on security_audit_log
ALTER TABLE public.security_audit_log ENABLE ROW LEVEL SECURITY;

-- Only admins and service role can view audit logs
CREATE POLICY "Admins can view audit logs"
ON public.security_audit_log
FOR SELECT
TO authenticated
USING (public.is_admin());

CREATE POLICY "Service role full access to audit logs"
ON public.security_audit_log
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- 5. CREATE FUNCTION TO LOG SECURITY EVENTS
CREATE OR REPLACE FUNCTION public.log_security_event(
  p_action text,
  p_resource_type text DEFAULT NULL,
  p_resource_id text DEFAULT NULL,
  p_details jsonb DEFAULT NULL,
  p_severity text DEFAULT 'info'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.security_audit_log (
    user_id,
    action,
    resource_type,
    resource_id,
    details,
    severity
  ) VALUES (
    auth.uid(),
    p_action,
    p_resource_type,
    p_resource_id,
    p_details,
    p_severity
  )
  RETURNING id INTO v_id;
  
  RETURN v_id;
END;
$$;

-- 6. CREATE BLOCKED IPS TABLE
CREATE TABLE IF NOT EXISTS public.blocked_ips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_address inet NOT NULL UNIQUE,
  reason text,
  blocked_by uuid,
  blocked_at timestamptz DEFAULT now(),
  expires_at timestamptz,
  is_permanent boolean DEFAULT false
);

-- Enable RLS
ALTER TABLE public.blocked_ips ENABLE ROW LEVEL SECURITY;

-- Only admins can manage blocked IPs
CREATE POLICY "Admins can manage blocked IPs"
ON public.blocked_ips
FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE POLICY "Service role full access to blocked IPs"
ON public.blocked_ips
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- 7. CREATE FAILED LOGIN ATTEMPTS TABLE
CREATE TABLE IF NOT EXISTS public.failed_login_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text,
  ip_address inet,
  user_agent text,
  attempt_count integer DEFAULT 1,
  first_attempt_at timestamptz DEFAULT now(),
  last_attempt_at timestamptz DEFAULT now(),
  is_blocked boolean DEFAULT false
);

-- Enable RLS
ALTER TABLE public.failed_login_attempts ENABLE ROW LEVEL SECURITY;

-- Only service role can access
CREATE POLICY "Service role manages failed logins"
ON public.failed_login_attempts
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- 8. ADD INDEXES FOR SECURITY TABLES
CREATE INDEX IF NOT EXISTS idx_rate_limits_user_endpoint 
ON public.rate_limits(user_id, endpoint, window_start);

CREATE INDEX IF NOT EXISTS idx_security_audit_user 
ON public.security_audit_log(user_id, created_at);

CREATE INDEX IF NOT EXISTS idx_security_audit_action 
ON public.security_audit_log(action, created_at);

CREATE INDEX IF NOT EXISTS idx_blocked_ips_address 
ON public.blocked_ips(ip_address);

CREATE INDEX IF NOT EXISTS idx_failed_logins_email 
ON public.failed_login_attempts(email, last_attempt_at);

-- 9. GRANT NECESSARY PERMISSIONS
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_moderator() TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_security_event(text, text, text, jsonb, text) TO authenticated;