
-- 1. Fix password_reset_otps: deny all access (managed server-side only)
CREATE POLICY "Deny all direct access to OTPs"
ON public.password_reset_otps FOR ALL
USING (false);

-- 2. Block direct INSERT on critical financial tables (must use SECURITY DEFINER RPCs)

DROP POLICY IF EXISTS "No direct gift inserts" ON public.gift_transactions;
CREATE POLICY "No direct gift inserts"
ON public.gift_transactions FOR INSERT
WITH CHECK (false);

DROP POLICY IF EXISTS "No direct game inserts" ON public.game_transactions;
CREATE POLICY "No direct game inserts"
ON public.game_transactions FOR INSERT
WITH CHECK (false);

DROP POLICY IF EXISTS "No direct coin transfer inserts" ON public.coin_transfers;
CREATE POLICY "No direct coin transfer inserts"
ON public.coin_transfers FOR INSERT
WITH CHECK (false);

DROP POLICY IF EXISTS "No direct agency diamond inserts" ON public.agency_diamond_transactions;
CREATE POLICY "No direct agency diamond inserts"
ON public.agency_diamond_transactions FOR INSERT
WITH CHECK (false);

DROP POLICY IF EXISTS "No direct withdrawal inserts" ON public.agency_withdrawals;
CREATE POLICY "No direct withdrawal inserts"
ON public.agency_withdrawals FOR INSERT
WITH CHECK (false);

-- 3. Block direct UPDATE/DELETE on gift_transactions and game_transactions
DROP POLICY IF EXISTS "No direct gift updates" ON public.gift_transactions;
CREATE POLICY "No direct gift updates"
ON public.gift_transactions FOR UPDATE
USING (false);

DROP POLICY IF EXISTS "No direct gift deletes" ON public.gift_transactions;
CREATE POLICY "No direct gift deletes"
ON public.gift_transactions FOR DELETE
USING (false);

DROP POLICY IF EXISTS "No direct game updates" ON public.game_transactions;
CREATE POLICY "No direct game updates"
ON public.game_transactions FOR UPDATE
USING (false);

DROP POLICY IF EXISTS "No direct game deletes" ON public.game_transactions;
CREATE POLICY "No direct game deletes"
ON public.game_transactions FOR DELETE
USING (false);

-- 4. Block direct modification of admin_users table
DROP POLICY IF EXISTS "No direct admin inserts" ON public.admin_users;
CREATE POLICY "No direct admin inserts"
ON public.admin_users FOR INSERT
WITH CHECK (false);

DROP POLICY IF EXISTS "No direct admin updates" ON public.admin_users;
CREATE POLICY "No direct admin updates"
ON public.admin_users FOR UPDATE
USING (false);

DROP POLICY IF EXISTS "No direct admin deletes" ON public.admin_users;
CREATE POLICY "No direct admin deletes"
ON public.admin_users FOR DELETE
USING (false);
