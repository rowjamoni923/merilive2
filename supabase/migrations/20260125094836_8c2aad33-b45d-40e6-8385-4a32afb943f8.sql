
-- Create a secure function that ONLY updates earnings columns
-- This bypasses foreign key checks on other columns like equipped_frame_id
CREATE OR REPLACE FUNCTION public.update_host_earnings_only(
  p_host_id uuid,
  p_beans_to_add bigint,
  p_new_total_earnings bigint,
  p_new_host_level integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_pending bigint;
  v_new_pending bigint;
BEGIN
  -- Get current pending_earnings
  SELECT COALESCE(pending_earnings, 0)::bigint INTO v_current_pending
  FROM profiles
  WHERE id = p_host_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Host not found');
  END IF;
  
  v_new_pending := v_current_pending + p_beans_to_add;
  
  -- Use raw SQL UPDATE to ONLY update these specific columns
  -- This avoids triggering foreign key checks on other columns
  UPDATE profiles
  SET 
    pending_earnings = v_new_pending,
    total_earnings = p_new_total_earnings,
    host_level = p_new_host_level,
    updated_at = now()
  WHERE id = p_host_id;
  
  RETURN jsonb_build_object(
    'success', true,
    'new_pending_earnings', v_new_pending,
    'total_earnings', p_new_total_earnings,
    'host_level', p_new_host_level
  );
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.update_host_earnings_only TO authenticated, anon, service_role;
