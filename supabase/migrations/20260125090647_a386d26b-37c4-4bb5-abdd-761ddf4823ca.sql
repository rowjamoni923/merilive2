-- Create a function to update host beans safely (bypasses foreign key issues)
CREATE OR REPLACE FUNCTION public.update_host_beans_only(
  p_host_id UUID,
  p_beans_to_add INTEGER,
  p_new_total BIGINT,
  p_new_level INTEGER
)
RETURNS VOID AS $$
BEGIN
  UPDATE profiles
  SET 
    pending_earnings = COALESCE(pending_earnings, 0) + p_beans_to_add,
    total_earnings = p_new_total,
    host_level = p_new_level
  WHERE id = p_host_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create increment_host_earnings function for RPC calls
CREATE OR REPLACE FUNCTION public.increment_host_earnings(
  host_id UUID,
  beans_amount INTEGER,
  new_total_earnings BIGINT,
  new_host_level INTEGER
)
RETURNS VOID AS $$
BEGIN
  UPDATE profiles
  SET 
    pending_earnings = COALESCE(pending_earnings, 0) + beans_amount,
    total_earnings = new_total_earnings,
    host_level = new_host_level,
    weekly_earnings = COALESCE(weekly_earnings, 0) + beans_amount
  WHERE id = host_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.update_host_beans_only TO service_role;
GRANT EXECUTE ON FUNCTION public.increment_host_earnings TO service_role;