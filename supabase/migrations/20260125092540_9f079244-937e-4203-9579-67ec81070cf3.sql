-- Drop existing functions that have overload issues
DROP FUNCTION IF EXISTS public.safe_add_host_beans(uuid, numeric, numeric, integer);
DROP FUNCTION IF EXISTS public.increment_host_earnings(uuid, numeric, numeric, integer);
DROP FUNCTION IF EXISTS public.increment_host_earnings(uuid, integer, bigint, integer);
DROP FUNCTION IF EXISTS public.update_host_beans_only(uuid, numeric, numeric, integer);
DROP FUNCTION IF EXISTS public.update_host_beans_only(uuid, integer, bigint, integer);

-- Create a SINGLE reliable function to add beans to host with only essential columns
CREATE OR REPLACE FUNCTION public.add_beans_to_host(
  p_host_id uuid,
  p_beans_amount bigint,
  p_total_earnings bigint,
  p_host_level integer
) RETURNS void AS $$
BEGIN
  -- ONLY update the essential earnings columns - avoid all foreign key issues
  UPDATE profiles 
  SET 
    pending_earnings = COALESCE(pending_earnings, 0) + p_beans_amount,
    total_earnings = p_total_earnings,
    host_level = p_host_level
  WHERE id = p_host_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.add_beans_to_host(uuid, bigint, bigint, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_beans_to_host(uuid, bigint, bigint, integer) TO anon;
GRANT EXECUTE ON FUNCTION public.add_beans_to_host(uuid, bigint, bigint, integer) TO service_role;