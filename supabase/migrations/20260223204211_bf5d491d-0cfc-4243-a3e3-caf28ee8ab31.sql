
-- Fix: Device recovery function - use one-time tokens instead of exposing deterministic passwords

-- Step 1: Create recovery_tokens table
CREATE TABLE IF NOT EXISTS public.recovery_tokens (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  device_id TEXT NOT NULL,
  token TEXT NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT now() + interval '15 minutes',
  is_used BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.recovery_tokens ENABLE ROW LEVEL SECURITY;

-- No direct access - only via functions
CREATE POLICY "No direct access" ON public.recovery_tokens FOR SELECT USING (false);

-- Index for fast lookups
CREATE INDEX idx_recovery_tokens_token ON public.recovery_tokens(token) WHERE is_used = false;
CREATE INDEX idx_recovery_tokens_device ON public.recovery_tokens(device_id);

-- Step 2: Replace the function to return a one-time token instead of password
CREATE OR REPLACE FUNCTION public.recover_session_by_device(
  p_device_id TEXT
)
RETURNS TABLE (
  user_id UUID,
  display_name TEXT,
  avatar_url TEXT,
  gender TEXT,
  is_host BOOLEAN,
  recovery_email TEXT,
  recovery_password TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile RECORD;
  v_email TEXT;
  v_token TEXT;
BEGIN
  -- Rate limit: max 5 recovery attempts per device per hour
  IF (SELECT count(*) FROM recovery_tokens WHERE device_id = p_device_id AND created_at > now() - interval '1 hour') >= 5 THEN
    RAISE EXCEPTION 'Too many recovery attempts. Please try again later.';
  END IF;

  -- Find the profile with this device ID
  SELECT p.id, p.display_name, p.avatar_url, p.gender, p.is_host
  INTO v_profile
  FROM profiles p
  WHERE p.device_id = p_device_id
  AND p.is_deleted IS NOT TRUE
  LIMIT 1;
  
  IF v_profile IS NULL THEN
    RETURN;
  END IF;
  
  -- Generate one-time recovery token
  v_token := encode(gen_random_bytes(32), 'hex');
  
  INSERT INTO recovery_tokens (user_id, device_id, token)
  VALUES (v_profile.id, p_device_id, v_token);
  
  -- Expire old unused tokens for this device
  UPDATE recovery_tokens SET is_used = true 
  WHERE device_id = p_device_id AND token != v_token AND is_used = false;
  
  v_email := 'guest_' || p_device_id || '@meri.local';
  
  -- Return token in password field for backward compatibility
  RETURN QUERY SELECT 
    v_profile.id,
    v_profile.display_name,
    v_profile.avatar_url,
    v_profile.gender,
    v_profile.is_host,
    v_email,
    v_token;  -- One-time token instead of deterministic password
END;
$$;

-- Cleanup old tokens (auto-expire)
CREATE OR REPLACE FUNCTION public.cleanup_expired_recovery_tokens()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM recovery_tokens WHERE expires_at < now() OR is_used = true;
END;
$$;
