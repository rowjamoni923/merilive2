
-- Rate limit tracking table
CREATE TABLE public.rate_limit_attempts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  identifier TEXT NOT NULL, -- user_id or IP address
  action_type TEXT NOT NULL, -- e.g. 'gift_send', 'coin_transfer', 'login', 'api_call'
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for fast lookups
CREATE INDEX idx_rate_limit_lookup ON public.rate_limit_attempts (identifier, action_type, attempted_at DESC);

-- Auto-cleanup old entries (older than 1 hour)
CREATE OR REPLACE FUNCTION public.cleanup_rate_limits()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.rate_limit_attempts WHERE attempted_at < now() - interval '1 hour';
END;
$$;

-- Rate limit check function
-- Returns true if allowed, false if rate limited
CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_identifier TEXT,
  p_action_type TEXT,
  p_max_requests INT DEFAULT 60,
  p_window_seconds INT DEFAULT 60
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INT;
  v_window_start TIMESTAMPTZ;
  v_allowed BOOLEAN;
BEGIN
  v_window_start := now() - (p_window_seconds || ' seconds')::interval;
  
  -- Count recent attempts
  SELECT COUNT(*) INTO v_count
  FROM public.rate_limit_attempts
  WHERE identifier = p_identifier
    AND action_type = p_action_type
    AND attempted_at >= v_window_start;
  
  v_allowed := v_count < p_max_requests;
  
  -- Log this attempt
  INSERT INTO public.rate_limit_attempts (identifier, action_type)
  VALUES (p_identifier, p_action_type);
  
  -- Periodic cleanup (1% chance per call)
  IF random() < 0.01 THEN
    PERFORM public.cleanup_rate_limits();
  END IF;
  
  RETURN jsonb_build_object(
    'allowed', v_allowed,
    'current_count', v_count + 1,
    'max_requests', p_max_requests,
    'window_seconds', p_window_seconds,
    'retry_after', CASE WHEN NOT v_allowed THEN p_window_seconds ELSE 0 END
  );
END;
$$;

-- Enable RLS
ALTER TABLE public.rate_limit_attempts ENABLE ROW LEVEL SECURITY;

-- Only service role can access (used via RPC function with SECURITY DEFINER)
-- No direct access policies needed since check_rate_limit is SECURITY DEFINER
