
CREATE OR REPLACE FUNCTION public.get_user_notices(p_user_id UUID)
RETURNS SETOF admin_notices
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_host BOOLEAN := FALSE;
  v_is_agency BOOLEAN := FALSE;
  v_is_helper BOOLEAN := FALSE;
  v_is_level5_helper BOOLEAN := FALSE;
  v_audiences TEXT[];
BEGIN
  -- Check if user is a host (female + verified)
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = p_user_id
    AND gender = 'Female'
    AND is_verified = true
  ) INTO v_is_host;

  -- Check if user is an agency owner
  SELECT EXISTS (
    SELECT 1 FROM agencies
    WHERE owner_id = p_user_id
    AND is_active = true
  ) INTO v_is_agency;

  -- Check if user is a helper (regular)
  SELECT EXISTS (
    SELECT 1 FROM topup_helpers
    WHERE user_id = p_user_id
    AND is_verified = true
  ) INTO v_is_helper;

  -- Check if user is a Level 5 helper (use trader_level instead of helper_level)
  SELECT EXISTS (
    SELECT 1 FROM topup_helpers
    WHERE user_id = p_user_id
    AND is_verified = true
    AND trader_level = 5
  ) INTO v_is_level5_helper;

  -- Build audiences array
  v_audiences := ARRAY['all', 'users'];
  
  IF v_is_host THEN
    v_audiences := array_append(v_audiences, 'hosts');
  END IF;
  
  IF v_is_agency THEN
    v_audiences := array_append(v_audiences, 'agencies');
  END IF;
  
  IF v_is_helper THEN
    v_audiences := array_append(v_audiences, 'helpers');
  END IF;
  
  IF v_is_level5_helper THEN
    v_audiences := array_append(v_audiences, 'level5_helpers');
  END IF;

  -- Return notices that match any of user's audiences
  RETURN QUERY
  SELECT an.*
  FROM admin_notices an
  WHERE an.is_active = true
    AND (an.expires_at IS NULL OR an.expires_at > now())
    AND an.target_audience && v_audiences
  ORDER BY 
    CASE an.priority 
      WHEN 'urgent' THEN 1 
      WHEN 'high' THEN 2 
      WHEN 'normal' THEN 3 
      ELSE 4 
    END,
    an.created_at DESC;
END;
$$;
