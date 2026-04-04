-- Create a simple policy that allows everyone to view shop items
CREATE POLICY "Anyone can view shop items public"
ON public.shop_items
FOR SELECT
USING (true);

-- Also ensure the admin manage policy works without is_admin
DROP POLICY IF EXISTS "Admins can manage shop items" ON public.shop_items;

-- Allow authenticated users to manage shop items (for now)
CREATE POLICY "Authenticated can manage shop items"
ON public.shop_items
FOR ALL
USING (auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() IS NOT NULL);