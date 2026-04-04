-- Add columns to track active session per user
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS active_session_id TEXT,
ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS last_login_device TEXT;

-- Create a function to update active session when user logs in
CREATE OR REPLACE FUNCTION public.update_active_session(
  p_user_id UUID,
  p_session_id TEXT,
  p_device_info TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE profiles
  SET 
    active_session_id = p_session_id,
    last_login_at = NOW(),
    last_login_device = COALESCE(p_device_info, last_login_device)
  WHERE id = p_user_id;
  
  RETURN FOUND;
END;
$$;

-- Create a function to check if current session is valid
CREATE OR REPLACE FUNCTION public.check_session_valid(
  p_user_id UUID,
  p_session_id TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_active_session TEXT;
BEGIN
  SELECT active_session_id INTO v_active_session
  FROM profiles
  WHERE id = p_user_id;
  
  -- If no active session set, consider valid
  IF v_active_session IS NULL THEN
    RETURN TRUE;
  END IF;
  
  -- Check if current session matches active session
  RETURN v_active_session = p_session_id;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.update_active_session(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_session_valid(UUID, TEXT) TO authenticated;