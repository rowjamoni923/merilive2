-- Create function to increment agency's total_agents count
CREATE OR REPLACE FUNCTION public.increment_agency_agents(agency_uuid UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE agencies 
  SET total_agents = COALESCE(total_agents, 0) + 1,
      updated_at = NOW()
  WHERE id = agency_uuid;
END;
$$;