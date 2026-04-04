-- Create a security definer function to get agency diamond balance by owner_id
-- This allows the recharge page to check helper balances without full agencies access
CREATE OR REPLACE FUNCTION public.get_agency_diamond_balance(owner_user_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(diamond_balance, 0)
  FROM agencies
  WHERE owner_id = owner_user_id
  LIMIT 1;
$$;