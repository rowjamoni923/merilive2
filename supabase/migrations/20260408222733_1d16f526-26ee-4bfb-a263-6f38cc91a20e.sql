
-- Allow all authenticated users to view shop items
CREATE POLICY "Authenticated users can view shop items"
ON public.shop_items
FOR SELECT
TO authenticated
USING (true);

-- Allow anonymous users to view active shop items too
CREATE POLICY "Anyone can view active shop items"
ON public.shop_items
FOR SELECT
TO anon
USING (is_active = true);

-- Users can view their own purchases
CREATE POLICY "Users can view own purchases"
ON public.user_purchases
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Users can insert their own purchases
CREATE POLICY "Users can insert own purchases"
ON public.user_purchases
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Users can update their own purchases (equip/unequip)
CREATE POLICY "Users can update own purchases"
ON public.user_purchases
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id);
