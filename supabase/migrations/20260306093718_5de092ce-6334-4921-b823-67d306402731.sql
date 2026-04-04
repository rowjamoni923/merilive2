-- Create cancel_agency_request function to bypass RLS
CREATE OR REPLACE FUNCTION public.cancel_agency_request(_host_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  DELETE FROM agency_hosts
  WHERE host_id = _host_id
    AND status = 'pending';

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  RETURN true;
END;
$$;

-- Add DELETE policy for hosts to cancel their own pending requests
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy 
    WHERE polrelid = 'public.agency_hosts'::regclass 
    AND polname = 'Hosts can cancel their own pending requests'
  ) THEN
    CREATE POLICY "Hosts can cancel their own pending requests"
    ON public.agency_hosts
    FOR DELETE
    TO authenticated
    USING (host_id = auth.uid() AND status = 'pending');
  END IF;
END $$;