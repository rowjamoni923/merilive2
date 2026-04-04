-- =====================================================
-- SECURITY FIX BATCH 3 - FINAL CORRECTED VERSION
-- =====================================================

-- Create helper for party room access (simplified without party_room_members)
CREATE OR REPLACE FUNCTION public.can_access_party_room(p_user_id uuid, p_room_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.party_rooms 
    WHERE id = p_room_id 
      AND (is_private = false OR host_id = p_user_id)
  )
$$;

-- Create secure function for agency access
CREATE OR REPLACE FUNCTION public.can_access_agency(p_user_id uuid, p_agency_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.agencies WHERE id = p_agency_id AND owner_id = p_user_id
  ) OR EXISTS (
    SELECT 1 FROM public.agency_hosts WHERE agency_id = p_agency_id AND host_id = p_user_id AND status = 'active'
  )
$$;

-- Create helper for stream ownership
CREATE OR REPLACE FUNCTION public.is_stream_owner(p_user_id uuid, p_stream_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.live_streams
    WHERE id = p_stream_id AND host_id = p_user_id
  )
$$;

-- Fix session management function
CREATE OR REPLACE FUNCTION public.cleanup_expired_sessions()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.rate_limits WHERE window_start < now() - interval '1 hour';
  DELETE FROM public.failed_login_attempts WHERE last_attempt_at < now() - interval '24 hours';
  DELETE FROM public.blocked_ips WHERE expires_at < now() AND is_permanent = false;
END;
$$;

-- Fix validate_input function for security
CREATE OR REPLACE FUNCTION public.validate_input(p_input text, p_type text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_input IS NULL OR p_input = '' THEN RETURN false; END IF;
  
  CASE p_type
    WHEN 'email' THEN RETURN p_input ~ '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$';
    WHEN 'username' THEN RETURN p_input ~ '^[a-zA-Z0-9_]{3,30}$';
    WHEN 'phone' THEN RETURN p_input ~ '^\+?[0-9]{10,15}$';
    WHEN 'uuid' THEN RETURN p_input ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
    ELSE RETURN true;
  END CASE;
END;
$$;

-- Create rate limit check function
CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_user_id uuid,
  p_endpoint text,
  p_max_requests integer DEFAULT 100,
  p_window_seconds integer DEFAULT 60
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
  v_window_start timestamptz;
BEGIN
  v_window_start := now() - (p_window_seconds || ' seconds')::interval;
  
  SELECT COALESCE(SUM(request_count), 0) INTO v_count
  FROM public.rate_limits
  WHERE user_id = p_user_id AND endpoint = p_endpoint AND window_start > v_window_start;
  
  IF v_count >= p_max_requests THEN
    PERFORM public.log_security_event('rate_limit_exceeded', 'endpoint', p_endpoint, jsonb_build_object('count', v_count, 'limit', p_max_requests), 'warn');
    RETURN false;
  END IF;
  
  INSERT INTO public.rate_limits (user_id, endpoint, request_count, window_start) VALUES (p_user_id, p_endpoint, 1, now()) ON CONFLICT DO NOTHING;
  RETURN true;
END;
$$;

-- Create function to check if IP is blocked
CREATE OR REPLACE FUNCTION public.is_ip_blocked(p_ip inet)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.blocked_ips
    WHERE ip_address = p_ip AND (is_permanent = true OR expires_at > now())
  )
$$;

-- Create function to handle suspicious activity
CREATE OR REPLACE FUNCTION public.handle_suspicious_activity(
  p_user_id uuid,
  p_activity_type text,
  p_details jsonb DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.log_security_event('suspicious_activity', p_activity_type, p_user_id::text, p_details, 'error');
  
  IF p_activity_type = 'phone_sharing' THEN
    UPDATE public.profiles SET phone_violation_count = COALESCE(phone_violation_count, 0) + 1 WHERE id = p_user_id;
  END IF;
END;
$$;

-- Create function to detect and prevent SQL injection
CREATE OR REPLACE FUNCTION public.sanitize_input(p_input text)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN regexp_replace(
    regexp_replace(p_input, E'[;\'\"\\/\\\\]', '', 'g'),
    E'--', '', 'g'
  );
END;
$$;

-- Create function to verify user session
CREATE OR REPLACE FUNCTION public.verify_session()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN false; END IF;
  
  IF EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND is_blocked = true
  ) THEN
    RETURN false;
  END IF;
  
  RETURN true;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.can_access_party_room(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_agency(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_stream_owner(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_rate_limit(uuid, text, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_ip_blocked(inet) TO authenticated;
GRANT EXECUTE ON FUNCTION public.validate_input(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_expired_sessions() TO service_role;
GRANT EXECUTE ON FUNCTION public.handle_suspicious_activity(uuid, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sanitize_input(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.verify_session() TO authenticated;