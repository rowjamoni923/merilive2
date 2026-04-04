-- Add RLS policy for hosts to view their own transfer records
CREATE POLICY "Hosts can view their own transfers"
ON public.agency_earnings_transfers
FOR SELECT
USING (host_id = auth.uid());

-- Also ensure hosts can view transfers by their host_id
-- This complements the existing agency owner policy