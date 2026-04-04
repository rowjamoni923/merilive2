-- Drop existing insert policy
DROP POLICY IF EXISTS "Authenticated users can create agency" ON agencies;

-- Create new insert policy that allows both users (for themselves) and admins (for anyone)
CREATE POLICY "Users can create own agency or admins can create for anyone" 
ON agencies 
FOR INSERT 
WITH CHECK (
  auth.uid() = owner_id 
  OR is_admin(auth.uid())
);