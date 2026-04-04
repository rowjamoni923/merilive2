-- Add admin insert policy for agency_hosts (for host transfers)
CREATE POLICY "Admins can add hosts to agencies" 
ON agency_hosts 
FOR INSERT 
WITH CHECK (is_admin(auth.uid()));

-- Add admin select policy for agency_hosts
CREATE POLICY "Admins can view all agency hosts" 
ON agency_hosts 
FOR SELECT 
USING (is_admin(auth.uid()));

-- Add admin update policy for agency_hosts
CREATE POLICY "Admins can update agency hosts" 
ON agency_hosts 
FOR UPDATE 
USING (is_admin(auth.uid()));

-- Add admin delete policy for agency_hosts
CREATE POLICY "Admins can delete agency hosts" 
ON agency_hosts 
FOR DELETE 
USING (is_admin(auth.uid()));