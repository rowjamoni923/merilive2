-- Add parent_agency_id to track sub-agency relationships
ALTER TABLE public.agencies 
ADD COLUMN IF NOT EXISTS parent_agency_id UUID REFERENCES public.agencies(id) ON DELETE SET NULL;

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_agencies_parent_agency_id ON public.agencies(parent_agency_id);

-- Create a view to get agency hierarchy stats
CREATE OR REPLACE FUNCTION public.get_agency_sub_agents_count(agency_uuid UUID)
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::integer FROM agencies WHERE parent_agency_id = agency_uuid AND is_active = true;
$$;

-- Function to get total hosts under an agency including sub-agencies
CREATE OR REPLACE FUNCTION public.get_agency_total_network(agency_uuid UUID)
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result JSON;
  direct_hosts INTEGER;
  sub_agencies INTEGER;
  sub_agency_hosts INTEGER;
BEGIN
  -- Direct hosts count
  SELECT COUNT(*)::integer INTO direct_hosts 
  FROM agency_hosts 
  WHERE agency_id = agency_uuid AND status = 'active';
  
  -- Sub-agencies count
  SELECT COUNT(*)::integer INTO sub_agencies 
  FROM agencies 
  WHERE parent_agency_id = agency_uuid AND is_active = true;
  
  -- Hosts under sub-agencies
  SELECT COALESCE(SUM(ah_count), 0)::integer INTO sub_agency_hosts
  FROM (
    SELECT COUNT(*) as ah_count 
    FROM agency_hosts ah
    JOIN agencies a ON ah.agency_id = a.id
    WHERE a.parent_agency_id = agency_uuid AND ah.status = 'active'
  ) counts;
  
  result := json_build_object(
    'direct_hosts', direct_hosts,
    'sub_agencies', sub_agencies,
    'sub_agency_hosts', sub_agency_hosts,
    'total_network', direct_hosts + sub_agency_hosts
  );
  
  RETURN result;
END;
$$;