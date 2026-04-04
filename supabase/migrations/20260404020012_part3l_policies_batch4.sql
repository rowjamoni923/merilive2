DROP POLICY IF EXISTS "Users can view their own sub-agent profile" ON public.sub_agents;
CREATE POLICY "Users can view their own sub-agent profile" ON public.sub_agents FOR SELECT TO authenticated USING (((auth.uid() = user_id) OR (auth.uid() IN ( SELECT agencies.owner_id
   FROM public.agencies
  WHERE (agencies.id = sub_agents.agency_id)))));

DROP POLICY IF EXISTS "Users can view their own submissions" ON public.face_verification_submissions;
CREATE POLICY "Users can view their own submissions" ON public.face_verification_submissions FOR SELECT TO authenticated USING ((auth.uid() = user_id));

DROP POLICY IF EXISTS "Users can view their own tickets" ON public.support_tickets;
CREATE POLICY "Users can view their own tickets" ON public.support_tickets FOR SELECT TO authenticated USING (((auth.uid() = user_id) OR public.has_role(auth.uid(), 'admin'::public.app_role)));

DROP POLICY IF EXISTS "Users can view their own transactions" ON public.payment_transactions;
CREATE POLICY "Users can view their own transactions" ON public.payment_transactions FOR SELECT TO authenticated USING ((user_id = auth.uid()));

DROP POLICY IF EXISTS "Users can view their own transactions" ON public.recharge_transactions;
CREATE POLICY "Users can view their own transactions" ON public.recharge_transactions FOR SELECT TO authenticated USING ((public.is_real_user() AND (auth.uid() = user_id)));

DROP POLICY IF EXISTS "Users can view their own transfers" ON public.coin_transfers;
CREATE POLICY "Users can view their own transfers" ON public.coin_transfers FOR SELECT TO authenticated USING ((public.is_real_user() AND ((auth.uid() = sender_id) OR (auth.uid() = receiver_id))));

DROP POLICY IF EXISTS "Users can view their own violations" ON public.live_violations;
CREATE POLICY "Users can view their own violations" ON public.live_violations FOR SELECT TO authenticated USING ((auth.uid() = user_id));

DROP POLICY IF EXISTS "Users manage own watchlist" ON public.watchlist;
CREATE POLICY "Users manage own watchlist" ON public.watchlist TO authenticated USING ((auth.uid() = user_id));

DROP POLICY IF EXISTS "Users see own claims" ON public.parcel_claims;
CREATE POLICY "Users see own claims" ON public.parcel_claims FOR SELECT TO authenticated USING ((user_id = auth.uid()));

DROP POLICY IF EXISTS "Users see own game transactions" ON public.game_transactions;
CREATE POLICY "Users see own game transactions" ON public.game_transactions FOR SELECT USING ((auth.uid() = user_id));

DROP POLICY IF EXISTS "Users see own parcels" ON public.user_parcels;
CREATE POLICY "Users see own parcels" ON public.user_parcels FOR SELECT TO authenticated USING ((user_id = auth.uid()));

DROP POLICY IF EXISTS "Withdrawal access restricted to stakeholders" ON public.agency_withdrawals;
CREATE POLICY "Withdrawal access restricted to stakeholders" ON public.agency_withdrawals FOR SELECT TO authenticated USING (((EXISTS ( SELECT 1
   FROM public.agencies
  WHERE ((agencies.id = agency_withdrawals.agency_id) AND (agencies.owner_id = auth.uid())))) OR (assigned_helper_id IN ( SELECT topup_helpers.id
   FROM public.topup_helpers
  WHERE (topup_helpers.user_id = auth.uid()))) OR public.is_admin(auth.uid())));