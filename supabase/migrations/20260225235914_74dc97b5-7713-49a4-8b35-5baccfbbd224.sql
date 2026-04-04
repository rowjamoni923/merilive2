
-- Grant table-level permissions
GRANT SELECT ON public.gift_transactions TO authenticated;
GRANT SELECT ON public.gift_transactions TO anon;
GRANT SELECT ON public.gifts TO authenticated;
GRANT SELECT ON public.gifts TO anon;

-- Add admin SELECT policy for gift_transactions
CREATE POLICY "Admins can view all gift transactions"
ON public.gift_transactions
FOR SELECT
USING (is_admin(auth.uid()));
