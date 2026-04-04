-- Drop existing functions and recreate with ONLY specific column updates
DROP FUNCTION IF EXISTS public.increment_host_earnings(uuid, numeric, numeric, integer);
DROP FUNCTION IF EXISTS public.update_host_beans_only(uuid, numeric, numeric, integer);

-- Create a new, safe function that ONLY updates specific columns
-- This avoids triggering foreign key validation on other columns
CREATE OR REPLACE FUNCTION public.safe_add_host_beans(
  p_host_id uuid,
  p_beans_to_add numeric,
  p_new_total_earnings numeric,
  p_new_host_level integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Use a raw UPDATE that only touches the specific columns we need
  -- This avoids foreign key validation issues with equipped_frame_id
  UPDATE profiles
  SET 
    pending_earnings = COALESCE(pending_earnings, 0) + p_beans_to_add,
    total_earnings = p_new_total_earnings,
    host_level = p_new_host_level
  WHERE id = p_host_id;
END;
$$;

-- Also create increment_host_earnings for backward compatibility
CREATE OR REPLACE FUNCTION public.increment_host_earnings(
  host_id uuid,
  beans_amount numeric,
  new_total_earnings numeric,
  new_host_level integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE profiles
  SET 
    pending_earnings = COALESCE(pending_earnings, 0) + beans_amount,
    total_earnings = new_total_earnings,
    host_level = new_host_level
  WHERE id = host_id;
END;
$$;

-- Create update_host_beans_only for backward compatibility
CREATE OR REPLACE FUNCTION public.update_host_beans_only(
  p_host_id uuid,
  p_beans_to_add numeric,
  p_new_total numeric,
  p_new_level integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE profiles
  SET 
    pending_earnings = COALESCE(pending_earnings, 0) + p_beans_to_add,
    total_earnings = p_new_total,
    host_level = p_new_level
  WHERE id = p_host_id;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.safe_add_host_beans(uuid, numeric, numeric, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.safe_add_host_beans(uuid, numeric, numeric, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.increment_host_earnings(uuid, numeric, numeric, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.increment_host_earnings(uuid, numeric, numeric, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.update_host_beans_only(uuid, numeric, numeric, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_host_beans_only(uuid, numeric, numeric, integer) TO service_role;