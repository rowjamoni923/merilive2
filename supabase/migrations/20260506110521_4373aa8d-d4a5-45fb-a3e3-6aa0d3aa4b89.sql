-- Tighten topup payment method visibility: remove anonymous public read
DROP POLICY IF EXISTS "public_read_active_topup_payment_methods_v2" ON public.topup_payment_methods;
DROP POLICY IF EXISTS "auth_read_topup_pm" ON public.topup_payment_methods;
CREATE POLICY "authenticated_read_active_topup_payment_methods"
ON public.topup_payment_methods
FOR SELECT
TO authenticated
USING (COALESCE(is_active, true) = true);

-- Remove broad full-agency read for every authenticated user
DROP POLICY IF EXISTS "Authenticated users can view agencies" ON public.agencies;

-- Reels interaction data must not be readable anonymously
DROP POLICY IF EXISTS "read_reel_likes" ON public.reel_likes;
CREATE POLICY "authenticated_read_reel_likes"
ON public.reel_likes
FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS "read_reel_comments" ON public.reel_comments;
CREATE POLICY "authenticated_read_reel_comments"
ON public.reel_comments
FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS "read_reel_shares" ON public.reel_shares;
CREATE POLICY "authenticated_read_reel_shares"
ON public.reel_shares
FOR SELECT
TO authenticated
USING (true);

-- VIP medal assignments must not expose user IDs anonymously
DROP POLICY IF EXISTS "Public read displayed medals" ON public.user_vip_medals;
CREATE POLICY "authenticated_read_displayed_vip_medals"
ON public.user_vip_medals
FOR SELECT
TO authenticated
USING (is_displayed = true);

-- Channels: remove anonymous/public stream URL enumeration
DROP POLICY IF EXISTS "public_read" ON public.channels;
DROP POLICY IF EXISTS "Anyone can view active channels" ON public.channels;
CREATE POLICY "authenticated_view_active_channels"
ON public.channels
FOR SELECT
TO authenticated
USING (is_active = true);

-- Helper country assignments: owner helper or admin/admin-session only
DROP POLICY IF EXISTS "read_helper_assigned_countries" ON public.helper_assigned_countries;
CREATE POLICY "helpers_view_own_assigned_countries"
ON public.helper_assigned_countries
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.topup_helpers th
    WHERE th.id = helper_assigned_countries.helper_id
      AND th.user_id = auth.uid()
  )
  OR public.is_admin(auth.uid())
  OR public.is_active_admin_session()
);

-- Game winner ticker must not expose transaction user IDs anonymously
DROP POLICY IF EXISTS "Winners visible for ticker" ON public.game_transactions;
