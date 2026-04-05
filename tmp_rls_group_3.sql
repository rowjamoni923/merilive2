-- === RLS Batch 7 ===
DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can delete own reels" ON public.reels;
END $$;
CREATE POLICY "Users can delete own reels" ON public.reels FOR DELETE USING (((auth.uid() = user_id) OR (EXISTS ( SELECT 1 FROM public.admin_users WHERE ((admin_users.user_id = auth.uid()) AND (admin_users.is_active = true))))));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can delete their own comments" ON public.reel_comments;
END $$;
CREATE POLICY "Users can delete their own comments" ON public.reel_comments FOR DELETE TO authenticated USING ((auth.uid() = user_id));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can delete their own poster images" ON public.poster_images;
END $$;
CREATE POLICY "Users can delete their own poster images" ON public.poster_images FOR DELETE TO authenticated USING ((auth.uid() = user_id));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can delete their own requests" ON public.seat_requests;
END $$;
CREATE POLICY "Users can delete their own requests" ON public.seat_requests FOR DELETE TO authenticated USING ((auth.uid() = requester_id));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can follow others" ON public.followers;
END $$;
CREATE POLICY "Users can follow others" ON public.followers FOR INSERT TO authenticated WITH CHECK ((auth.uid() = follower_id));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can insert own claims" ON public.daily_login_claims;
END $$;
CREATE POLICY "Users can insert own claims" ON public.daily_login_claims FOR INSERT WITH CHECK ((auth.uid() = user_id));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can insert own encryption keys" ON public.conversation_encryption_keys;
END $$;
CREATE POLICY "Users can insert own encryption keys" ON public.conversation_encryption_keys FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can insert own face violations" ON public.live_face_violations;
END $$;
CREATE POLICY "Users can insert own face violations" ON public.live_face_violations FOR INSERT WITH CHECK ((auth.uid() = host_id));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
END $$;
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK ((auth.uid() = id));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can insert own session logs" ON public.session_security_logs;
END $$;
CREATE POLICY "Users can insert own session logs" ON public.session_security_logs FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can insert their own VIP subscriptions" ON public.user_vip_subscriptions;
END $$;
CREATE POLICY "Users can insert their own VIP subscriptions" ON public.user_vip_subscriptions FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can insert their own application" ON public.host_applications;
END $$;
CREATE POLICY "Users can insert their own application" ON public.host_applications FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can insert their own face record" ON public.face_records;
END $$;
CREATE POLICY "Users can insert their own face record" ON public.face_records FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can insert their own poster images" ON public.poster_images;
END $$;
CREATE POLICY "Users can insert their own poster images" ON public.poster_images FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can insert their own purchased backgrounds" ON public.user_purchased_backgrounds;
END $$;
CREATE POLICY "Users can insert their own purchased backgrounds" ON public.user_purchased_backgrounds FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can join PK competitions" ON public.pk_participants;
END $$;
CREATE POLICY "Users can join PK competitions" ON public.pk_participants FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can join agencies" ON public.agency_hosts;
END $$;
CREATE POLICY "Users can join agencies" ON public.agency_hosts FOR INSERT TO authenticated WITH CHECK ((auth.uid() = host_id));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can join games" ON public.game_players;
END $$;
CREATE POLICY "Users can join games" ON public.game_players FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can join groups" ON public.group_members;
END $$;
CREATE POLICY "Users can join groups" ON public.group_members FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can join rooms" ON public.party_room_participants;
END $$;
CREATE POLICY "Users can join rooms" ON public.party_room_participants FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can join streams" ON public.stream_viewers;
END $$;
CREATE POLICY "Users can join streams" ON public.stream_viewers FOR INSERT TO authenticated WITH CHECK ((auth.uid() = viewer_id));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can leave groups" ON public.group_members;
END $$;
CREATE POLICY "Users can leave groups" ON public.group_members FOR DELETE TO authenticated USING (((auth.uid() = user_id) OR (EXISTS ( SELECT 1 FROM public.groups g WHERE ((g.id = group_members.group_id) AND (g.owner_id = auth.uid()))))));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can leave rooms" ON public.party_room_participants;
END $$;
CREATE POLICY "Users can leave rooms" ON public.party_room_participants FOR UPDATE TO authenticated USING ((auth.uid() = user_id));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can leave streams" ON public.stream_viewers;
END $$;
CREATE POLICY "Users can leave streams" ON public.stream_viewers FOR UPDATE TO authenticated USING ((auth.uid() = viewer_id));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can manage own streak" ON public.user_login_streaks;
END $$;
CREATE POLICY "Users can manage own streak" ON public.user_login_streaks USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can place live game bets" ON public.live_game_bets;
END $$;
CREATE POLICY "Users can place live game bets" ON public.live_game_bets FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can read active notices" ON public.admin_notices;
END $$;
CREATE POLICY "Users can read active notices" ON public.admin_notices FOR SELECT TO authenticated USING ((public.is_real_user() AND ((is_active = true) AND ((expires_at IS NULL) OR (expires_at > now())))));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can read own bonus progress" ON public.new_host_live_bonus_progress;
END $$;
CREATE POLICY "Users can read own bonus progress" ON public.new_host_live_bonus_progress FOR SELECT TO authenticated USING ((auth.uid() = user_id));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can read own cashback history" ON public.consumption_return_history;
END $$;
CREATE POLICY "Users can read own cashback history" ON public.consumption_return_history FOR SELECT USING ((auth.uid() = user_id));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can read own claims" ON public.daily_login_claims;
END $$;
CREATE POLICY "Users can read own claims" ON public.daily_login_claims FOR SELECT USING ((auth.uid() = user_id));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can read own first recharge" ON public.first_recharge_claims;
END $$;
CREATE POLICY "Users can read own first recharge" ON public.first_recharge_claims FOR SELECT USING ((auth.uid() = user_id));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can read own sent gifts" ON public.gift_transactions;
END $$;
CREATE POLICY "Users can read own sent gifts" ON public.gift_transactions FOR SELECT USING (((auth.uid() = sender_id) OR (auth.uid() = receiver_id)));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can read own streak" ON public.user_login_streaks;
END $$;
CREATE POLICY "Users can read own streak" ON public.user_login_streaks FOR SELECT USING ((auth.uid() = user_id));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can remove themselves" ON public.stream_viewers;
END $$;
CREATE POLICY "Users can remove themselves" ON public.stream_viewers FOR DELETE TO authenticated USING ((auth.uid() = viewer_id));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can see their own calls" ON public.private_calls;
END $$;
CREATE POLICY "Users can see their own calls" ON public.private_calls FOR SELECT TO authenticated USING (((auth.uid() = caller_id) OR (auth.uid() = host_id)));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can send messages" ON public.messages;
END $$;
CREATE POLICY "Users can send messages" ON public.messages FOR INSERT TO authenticated WITH CHECK (((auth.uid() = sender_id) AND public.is_conversation_participant(auth.uid(), conversation_id)));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can send messages to their tickets" ON public.support_messages;
END $$;
CREATE POLICY "Users can send messages to their tickets" ON public.support_messages FOR INSERT TO authenticated WITH CHECK (((auth.uid() = sender_id) AND (EXISTS ( SELECT 1 FROM public.support_tickets WHERE ((support_tickets.id = support_messages.ticket_id) AND (support_tickets.user_id = auth.uid()))))));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can submit helper applications" ON public.helper_applications;
END $$;
CREATE POLICY "Users can submit helper applications" ON public.helper_applications FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can submit rating claim" ON public.rating_reward_claims;
END $$;
CREATE POLICY "Users can submit rating claim" ON public.rating_reward_claims FOR INSERT WITH CHECK ((auth.uid() = user_id));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can unblock" ON public.user_blocks;
END $$;
CREATE POLICY "Users can unblock" ON public.user_blocks FOR DELETE TO authenticated USING ((blocker_id = auth.uid()));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can unfollow" ON public.followers;
END $$;
CREATE POLICY "Users can unfollow" ON public.followers FOR DELETE TO authenticated USING ((auth.uid() = follower_id));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can unlike their own likes" ON public.reel_likes;
END $$;
CREATE POLICY "Users can unlike their own likes" ON public.reel_likes FOR DELETE TO authenticated USING ((auth.uid() = user_id));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can update messages in their conversations" ON public.messages;
END $$;
CREATE POLICY "Users can update messages in their conversations" ON public.messages FOR UPDATE TO authenticated USING (public.is_conversation_participant(auth.uid(), conversation_id)) WITH CHECK (public.is_conversation_participant(auth.uid(), conversation_id));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can update own conversations" ON public.conversations;
END $$;
CREATE POLICY "Users can update own conversations" ON public.conversations FOR UPDATE TO authenticated USING (((auth.uid() = participant_1) OR (auth.uid() = participant_2)));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can update own encryption keys" ON public.conversation_encryption_keys;
END $$;
CREATE POLICY "Users can update own encryption keys" ON public.conversation_encryption_keys FOR UPDATE TO authenticated USING ((auth.uid() = user_id));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can update own invitations" ON public.user_invitations;
END $$;
CREATE POLICY "Users can update own invitations" ON public.user_invitations FOR UPDATE TO authenticated USING ((auth.uid() = inviter_id));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
END $$;
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING ((public.is_real_user() AND (auth.uid() = id)));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can update own purchases" ON public.user_purchases;
END $$;
CREATE POLICY "Users can update own purchases" ON public.user_purchases FOR UPDATE TO authenticated USING ((auth.uid() = user_id));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can update own streak" ON public.user_login_streaks;
END $$;
CREATE POLICY "Users can update own streak" ON public.user_login_streaks FOR UPDATE USING ((auth.uid() = user_id));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can update read status" ON public.support_messages;
END $$;
CREATE POLICY "Users can update read status" ON public.support_messages FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1 FROM public.support_tickets WHERE ((support_tickets.id = support_messages.ticket_id) AND (support_tickets.user_id = auth.uid()))))) WITH CHECK ((EXISTS ( SELECT 1 FROM public.support_tickets WHERE ((support_tickets.id = support_messages.ticket_id) AND (support_tickets.user_id = auth.uid())))));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can update their own VIP subscriptions" ON public.user_vip_subscriptions;
END $$;
CREATE POLICY "Users can update their own VIP subscriptions" ON public.user_vip_subscriptions FOR UPDATE TO authenticated USING ((auth.uid() = user_id));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can update their own comments" ON public.reel_comments;
END $$;
CREATE POLICY "Users can update their own comments" ON public.reel_comments FOR UPDATE TO authenticated USING ((auth.uid() = user_id));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can update their own face record" ON public.face_records;
END $$;
CREATE POLICY "Users can update their own face record" ON public.face_records FOR UPDATE TO authenticated USING ((auth.uid() = user_id));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can update their own invitations" ON public.seat_invitations;
END $$;
CREATE POLICY "Users can update their own invitations" ON public.seat_invitations FOR UPDATE TO authenticated USING (((invitee_id = auth.uid()) OR (host_id = auth.uid())));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can update their own notifications" ON public.notifications;
END $$;
CREATE POLICY "Users can update their own notifications" ON public.notifications FOR UPDATE TO authenticated USING ((auth.uid() = user_id));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can update their own poster images" ON public.poster_images;
END $$;
CREATE POLICY "Users can update their own poster images" ON public.poster_images FOR UPDATE TO authenticated USING ((auth.uid() = user_id));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can update their own reels" ON public.reels;
END $$;
CREATE POLICY "Users can update their own reels" ON public.reels FOR UPDATE TO authenticated USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can update their own requests" ON public.seat_requests;
END $$;
CREATE POLICY "Users can update their own requests" ON public.seat_requests FOR UPDATE TO authenticated USING (((auth.uid() = requester_id) OR (EXISTS ( SELECT 1 FROM public.party_rooms WHERE ((party_rooms.id = seat_requests.room_id) AND (party_rooms.host_id = auth.uid()))))));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can upsert own streak" ON public.user_login_streaks;
END $$;
CREATE POLICY "Users can upsert own streak" ON public.user_login_streaks FOR INSERT WITH CHECK ((auth.uid() = user_id));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can view agency hosts" ON public.agency_hosts;
END $$;
CREATE POLICY "Users can view agency hosts" ON public.agency_hosts FOR SELECT TO authenticated USING (((host_id = auth.uid()) OR public.is_admin(auth.uid()) OR public.is_agency_owner(auth.uid(), agency_id)));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can view all bets in session" ON public.roulette_bets;
END $$;
CREATE POLICY "Users can view all bets in session" ON public.roulette_bets FOR SELECT TO authenticated USING (true);

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can view any poster images" ON public.poster_images;
END $$;
CREATE POLICY "Users can view any poster images" ON public.poster_images FOR SELECT TO authenticated USING (true);

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can view live game bets" ON public.live_game_bets;
END $$;
CREATE POLICY "Users can view live game bets" ON public.live_game_bets FOR SELECT TO authenticated USING (true);

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can view messages for their tickets" ON public.support_messages;
END $$;
CREATE POLICY "Users can view messages for their tickets" ON public.support_messages FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1 FROM public.support_tickets WHERE ((support_tickets.id = support_messages.ticket_id) AND ((support_tickets.user_id = auth.uid()) OR public.has_role(auth.uid(), 'admin'::public.app_role))))));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can view messages in their conversations" ON public.messages;
END $$;
CREATE POLICY "Users can view messages in their conversations" ON public.messages FOR SELECT TO authenticated USING (public.is_conversation_participant(auth.uid(), conversation_id));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can view own bets" ON public.game_bets;
END $$;
CREATE POLICY "Users can view own bets" ON public.game_bets FOR SELECT TO authenticated USING ((user_id = auth.uid()));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can view own claims" ON public.invitation_reward_claims;
END $$;
CREATE POLICY "Users can view own claims" ON public.invitation_reward_claims FOR SELECT TO authenticated USING ((auth.uid() = user_id));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can view own conversations" ON public.conversations;
END $$;
CREATE POLICY "Users can view own conversations" ON public.conversations FOR SELECT TO authenticated USING (((auth.uid() = participant_1) OR (auth.uid() = participant_2)));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can view own encryption keys" ON public.conversation_encryption_keys;
END $$;
CREATE POLICY "Users can view own encryption keys" ON public.conversation_encryption_keys FOR SELECT TO authenticated USING ((auth.uid() = user_id));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can view own exchange history" ON public.user_beans_exchange_history;
END $$;
CREATE POLICY "Users can view own exchange history" ON public.user_beans_exchange_history FOR SELECT TO authenticated USING ((auth.uid() = user_id));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can view own face violations" ON public.live_face_violations;
END $$;
CREATE POLICY "Users can view own face violations" ON public.live_face_violations FOR SELECT USING ((auth.uid() = host_id));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can view own full profile" ON public.profiles;
END $$;
CREATE POLICY "Users can view own full profile" ON public.profiles FOR SELECT TO authenticated USING ((public.is_real_user() AND (auth.uid() = id)));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can view own game transactions" ON public.game_transactions;
END $$;
CREATE POLICY "Users can view own game transactions" ON public.game_transactions FOR SELECT TO authenticated USING ((public.is_real_user() AND (auth.uid() = user_id)));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can view own helper applications" ON public.helper_applications;
END $$;
CREATE POLICY "Users can view own helper applications" ON public.helper_applications FOR SELECT TO authenticated USING ((auth.uid() = user_id));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can view own invitations" ON public.user_invitations;
END $$;
CREATE POLICY "Users can view own invitations" ON public.user_invitations FOR SELECT TO authenticated USING (((auth.uid() = inviter_id) OR (auth.uid() = invited_user_id)));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can view own moderation logs" ON public.chat_moderation_logs;
END $$;
CREATE POLICY "Users can view own moderation logs" ON public.chat_moderation_logs FOR SELECT TO authenticated USING ((auth.uid() = user_id));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can view own orders" ON public.helper_orders;
END $$;
CREATE POLICY "Users can view own orders" ON public.helper_orders FOR SELECT TO authenticated USING ((user_id = auth.uid()));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can view own progress" ON public.user_task_progress;
END $$;
CREATE POLICY "Users can view own progress" ON public.user_task_progress FOR SELECT TO authenticated USING ((auth.uid() = user_id));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can view own purchases" ON public.user_purchases;
END $$;
CREATE POLICY "Users can view own purchases" ON public.user_purchases FOR SELECT TO authenticated USING ((auth.uid() = user_id));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can view own rating claims" ON public.rating_reward_claims;
END $$;
CREATE POLICY "Users can view own rating claims" ON public.rating_reward_claims FOR SELECT USING ((auth.uid() = user_id));

-- === RLS Batch 8 ===
DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can view own recharges" ON public.recharge_transactions;
END $$;
CREATE POLICY "Users can view own recharges" ON public.recharge_transactions FOR SELECT TO authenticated USING ((public.is_real_user() AND ((auth.uid() = user_id) OR public.is_admin(auth.uid()))));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can view own reels" ON public.reels;
END $$;
CREATE POLICY "Users can view own reels" ON public.reels FOR SELECT TO authenticated USING ((auth.uid() = user_id));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can view own reports" ON public.user_reports;
END $$;
CREATE POLICY "Users can view own reports" ON public.user_reports FOR SELECT TO authenticated USING ((auth.uid() = reporter_id));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can view own requests" ON public.host_conversion_requests;
END $$;
CREATE POLICY "Users can view own requests" ON public.host_conversion_requests FOR SELECT TO authenticated USING ((auth.uid() = user_id));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can view own session logs" ON public.session_security_logs;
END $$;
CREATE POLICY "Users can view own session logs" ON public.session_security_logs FOR SELECT TO authenticated USING ((auth.uid() = user_id));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can view own subscriptions" ON public.user_subscriptions;
END $$;
CREATE POLICY "Users can view own subscriptions" ON public.user_subscriptions FOR SELECT TO authenticated USING ((auth.uid() = user_id));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can view own transactions" ON public.gift_transactions;
END $$;
CREATE POLICY "Users can view own transactions" ON public.gift_transactions FOR SELECT TO authenticated USING ((public.is_real_user() AND ((auth.uid() = sender_id) OR (auth.uid() = receiver_id))));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can view own welcome bonus" ON public.welcome_bonuses;
END $$;
CREATE POLICY "Users can view own welcome bonus" ON public.welcome_bonuses FOR SELECT TO authenticated USING ((auth.uid() = user_id));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can view their own PK rewards" ON public.pk_reward_history;
END $$;
CREATE POLICY "Users can view their own PK rewards" ON public.pk_reward_history FOR SELECT TO authenticated USING ((auth.uid() = user_id));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can view their own VIP subscriptions" ON public.user_vip_subscriptions;
END $$;
CREATE POLICY "Users can view their own VIP subscriptions" ON public.user_vip_subscriptions FOR SELECT TO authenticated USING ((auth.uid() = user_id));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can view their own application" ON public.host_applications;
END $$;
CREATE POLICY "Users can view their own application" ON public.host_applications FOR SELECT TO authenticated USING ((auth.uid() = user_id));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can view their own bans" ON public.live_bans;
END $$;
CREATE POLICY "Users can view their own bans" ON public.live_bans FOR SELECT TO authenticated USING ((auth.uid() = user_id));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can view their own blocks" ON public.user_blocks;
END $$;
CREATE POLICY "Users can view their own blocks" ON public.user_blocks FOR SELECT TO authenticated USING ((blocker_id = auth.uid()));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can view their own calls" ON public.private_calls;
END $$;
CREATE POLICY "Users can view their own calls" ON public.private_calls FOR SELECT TO authenticated USING (((auth.uid() = caller_id) OR (auth.uid() = host_id)));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can view their own entry banners" ON public.user_entry_banners;
END $$;
CREATE POLICY "Users can view their own entry banners" ON public.user_entry_banners FOR SELECT TO authenticated USING ((auth.uid() = user_id));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can view their own face record" ON public.face_records;
END $$;
CREATE POLICY "Users can view their own face record" ON public.face_records FOR SELECT TO authenticated USING ((auth.uid() = user_id));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can view their own invitations" ON public.seat_invitations;
END $$;
CREATE POLICY "Users can view their own invitations" ON public.seat_invitations FOR SELECT TO authenticated USING (((invitee_id = auth.uid()) OR (host_id = auth.uid())));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can view their own notifications" ON public.notifications;
END $$;
CREATE POLICY "Users can view their own notifications" ON public.notifications FOR SELECT TO authenticated USING ((auth.uid() = user_id));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can view their own offer claims" ON public.limited_offer_claims;
END $$;
CREATE POLICY "Users can view their own offer claims" ON public.limited_offer_claims FOR SELECT USING ((auth.uid() = user_id));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can view their own orders by email" ON public.subscription_orders;
END $$;
CREATE POLICY "Users can view their own orders by email" ON public.subscription_orders FOR SELECT TO authenticated USING (true);

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can view their own purchased backgrounds" ON public.user_purchased_backgrounds;
END $$;
CREATE POLICY "Users can view their own purchased backgrounds" ON public.user_purchased_backgrounds FOR SELECT TO authenticated USING ((auth.uid() = user_id));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can view their own reports" ON public.reel_reports;
END $$;
CREATE POLICY "Users can view their own reports" ON public.reel_reports FOR SELECT TO authenticated USING ((auth.uid() = user_id));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can view their own return history" ON public.consumption_return_history;
END $$;
CREATE POLICY "Users can view their own return history" ON public.consumption_return_history FOR SELECT USING ((auth.uid() = user_id));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can view their own reward history" ON public.leaderboard_reward_history;
END $$;
CREATE POLICY "Users can view their own reward history" ON public.leaderboard_reward_history FOR SELECT TO authenticated USING ((auth.uid() = user_id));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can view their own role frames" ON public.user_role_frames;
END $$;
CREATE POLICY "Users can view their own role frames" ON public.user_role_frames FOR SELECT TO authenticated USING ((user_id = auth.uid()));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can view their own sub-agent profile" ON public.sub_agents;
END $$;
CREATE POLICY "Users can view their own sub-agent profile" ON public.sub_agents FOR SELECT TO authenticated USING (((auth.uid() = user_id) OR (auth.uid() IN ( SELECT agencies.owner_id FROM public.agencies WHERE (agencies.id = sub_agents.agency_id)))));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can view their own submissions" ON public.face_verification_submissions;
END $$;
CREATE POLICY "Users can view their own submissions" ON public.face_verification_submissions FOR SELECT TO authenticated USING ((auth.uid() = user_id));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can view their own tickets" ON public.support_tickets;
END $$;
CREATE POLICY "Users can view their own tickets" ON public.support_tickets FOR SELECT TO authenticated USING (((auth.uid() = user_id) OR public.has_role(auth.uid(), 'admin'::public.app_role)));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can view their own transactions" ON public.payment_transactions;
END $$;
CREATE POLICY "Users can view their own transactions" ON public.payment_transactions FOR SELECT TO authenticated USING ((user_id = auth.uid()));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can view their own transactions" ON public.recharge_transactions;
END $$;
CREATE POLICY "Users can view their own transactions" ON public.recharge_transactions FOR SELECT TO authenticated USING ((public.is_real_user() AND (auth.uid() = user_id)));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can view their own transfers" ON public.coin_transfers;
END $$;
CREATE POLICY "Users can view their own transfers" ON public.coin_transfers FOR SELECT TO authenticated USING ((public.is_real_user() AND ((auth.uid() = sender_id) OR (auth.uid() = receiver_id))));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can view their own violations" ON public.live_violations;
END $$;
CREATE POLICY "Users can view their own violations" ON public.live_violations FOR SELECT TO authenticated USING ((auth.uid() = user_id));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users manage own watchlist" ON public.watchlist;
END $$;
CREATE POLICY "Users manage own watchlist" ON public.watchlist TO authenticated USING ((auth.uid() = user_id));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users see own claims" ON public.parcel_claims;
END $$;
CREATE POLICY "Users see own claims" ON public.parcel_claims FOR SELECT TO authenticated USING ((user_id = auth.uid()));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users see own game transactions" ON public.game_transactions;
END $$;
CREATE POLICY "Users see own game transactions" ON public.game_transactions FOR SELECT USING ((auth.uid() = user_id));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users see own parcels" ON public.user_parcels;
END $$;
CREATE POLICY "Users see own parcels" ON public.user_parcels FOR SELECT TO authenticated USING ((user_id = auth.uid()));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Withdrawal access restricted to stakeholders" ON public.agency_withdrawals;
END $$;
CREATE POLICY "Withdrawal access restricted to stakeholders" ON public.agency_withdrawals FOR SELECT TO authenticated USING (((EXISTS ( SELECT 1 FROM public.agencies WHERE ((agencies.id = agency_withdrawals.agency_id) AND (agencies.owner_id = auth.uid())))) OR (assigned_helper_id IN ( SELECT topup_helpers.id FROM public.topup_helpers WHERE (topup_helpers.user_id = auth.uid()))) OR public.is_admin(auth.uid())));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admin can delete shop items" ON storage.objects;
END $$;
CREATE POLICY "Admin can delete shop items" ON storage.objects FOR DELETE USING (((bucket_id = 'shop-items'::text) AND (EXISTS ( SELECT 1 FROM public.admin_users au WHERE ((au.user_id = auth.uid()) AND (au.is_active = true))))));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admin can update shop items" ON storage.objects;
END $$;
CREATE POLICY "Admin can update shop items" ON storage.objects FOR UPDATE USING (((bucket_id = 'shop-items'::text) AND (EXISTS ( SELECT 1 FROM public.admin_users au WHERE ((au.user_id = auth.uid()) AND (au.is_active = true))))));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admin can upload shop items" ON storage.objects;
END $$;
CREATE POLICY "Admin can upload shop items" ON storage.objects FOR INSERT WITH CHECK (((bucket_id = 'shop-items'::text) AND (EXISTS ( SELECT 1 FROM public.admin_users au WHERE ((au.user_id = auth.uid()) AND (au.is_active = true))))));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admin delete chat-bubbles" ON storage.objects;
END $$;
CREATE POLICY "Admin delete chat-bubbles" ON storage.objects FOR DELETE USING ((bucket_id = 'chat-bubbles'::text));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admin delete noble-cards" ON storage.objects;
END $$;
CREATE POLICY "Admin delete noble-cards" ON storage.objects FOR DELETE USING ((bucket_id = 'noble-cards'::text));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admin delete vehicle-entrances" ON storage.objects;
END $$;
CREATE POLICY "Admin delete vehicle-entrances" ON storage.objects FOR DELETE USING ((bucket_id = 'vehicle-entrances'::text));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admin delete vip-medals" ON storage.objects;
END $$;
CREATE POLICY "Admin delete vip-medals" ON storage.objects FOR DELETE USING ((bucket_id = 'vip-medals'::text));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admin update chat-bubbles" ON storage.objects;
END $$;
CREATE POLICY "Admin update chat-bubbles" ON storage.objects FOR UPDATE USING ((bucket_id = 'chat-bubbles'::text));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admin update noble-cards" ON storage.objects;
END $$;
CREATE POLICY "Admin update noble-cards" ON storage.objects FOR UPDATE USING ((bucket_id = 'noble-cards'::text));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admin update vehicle-entrances" ON storage.objects;
END $$;
CREATE POLICY "Admin update vehicle-entrances" ON storage.objects FOR UPDATE USING ((bucket_id = 'vehicle-entrances'::text));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admin update vip-medals" ON storage.objects;
END $$;
CREATE POLICY "Admin update vip-medals" ON storage.objects FOR UPDATE USING ((bucket_id = 'vip-medals'::text));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admin upload chat-bubbles" ON storage.objects;
END $$;
CREATE POLICY "Admin upload chat-bubbles" ON storage.objects FOR INSERT WITH CHECK ((bucket_id = 'chat-bubbles'::text));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admin upload noble-cards" ON storage.objects;
END $$;
CREATE POLICY "Admin upload noble-cards" ON storage.objects FOR INSERT WITH CHECK ((bucket_id = 'noble-cards'::text));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admin upload vehicle-entrances" ON storage.objects;
END $$;
CREATE POLICY "Admin upload vehicle-entrances" ON storage.objects FOR INSERT WITH CHECK ((bucket_id = 'vehicle-entrances'::text));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admin upload vip-medals" ON storage.objects;
END $$;
CREATE POLICY "Admin upload vip-medals" ON storage.objects FOR INSERT WITH CHECK ((bucket_id = 'vip-medals'::text));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can delete banners" ON storage.objects;
END $$;
CREATE POLICY "Admins can delete banners" ON storage.objects FOR DELETE USING (((bucket_id = 'banners'::text) AND (auth.role() = 'authenticated'::text)));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can delete branding assets" ON storage.objects;
END $$;
CREATE POLICY "Admins can delete branding assets" ON storage.objects FOR DELETE USING (((bucket_id = 'branding'::text) AND public.is_admin(auth.uid())));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can delete content media" ON storage.objects;
END $$;
CREATE POLICY "Admins can delete content media" ON storage.objects FOR DELETE TO authenticated USING (((bucket_id = 'content-media'::text) AND public.has_role(auth.uid(), 'admin'::public.app_role)));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can delete level assets" ON storage.objects;
END $$;
CREATE POLICY "Admins can delete level assets" ON storage.objects FOR DELETE USING (((bucket_id = 'level-assets'::text) AND public.is_admin(auth.uid())));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can delete old recordings" ON storage.objects;
END $$;
CREATE POLICY "Admins can delete old recordings" ON storage.objects FOR DELETE USING (((bucket_id = 'live-recordings'::text) AND (EXISTS ( SELECT 1 FROM public.user_roles WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = 'admin'::public.app_role))))));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can delete party backgrounds" ON storage.objects;
END $$;
CREATE POLICY "Admins can delete party backgrounds" ON storage.objects FOR DELETE USING (((bucket_id = 'party-backgrounds'::text) AND (auth.role() = 'authenticated'::text)));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can delete payment logos" ON storage.objects;
END $$;
CREATE POLICY "Admins can delete payment logos" ON storage.objects FOR DELETE USING ((bucket_id = 'payment-logos'::text));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can update banners" ON storage.objects;
END $$;
CREATE POLICY "Admins can update banners" ON storage.objects FOR UPDATE USING (((bucket_id = 'banners'::text) AND (auth.role() = 'authenticated'::text)));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can update branding assets" ON storage.objects;
END $$;
CREATE POLICY "Admins can update branding assets" ON storage.objects FOR UPDATE USING (((bucket_id = 'branding'::text) AND public.is_admin(auth.uid())));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can update level assets" ON storage.objects;
END $$;
CREATE POLICY "Admins can update level assets" ON storage.objects FOR UPDATE USING (((bucket_id = 'level-assets'::text) AND public.is_admin(auth.uid())));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can update party backgrounds" ON storage.objects;
END $$;
CREATE POLICY "Admins can update party backgrounds" ON storage.objects FOR UPDATE USING (((bucket_id = 'party-backgrounds'::text) AND (auth.role() = 'authenticated'::text)));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can update payment logos" ON storage.objects;
END $$;
CREATE POLICY "Admins can update payment logos" ON storage.objects FOR UPDATE USING ((bucket_id = 'payment-logos'::text));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can upload banners" ON storage.objects;
END $$;
CREATE POLICY "Admins can upload banners" ON storage.objects FOR INSERT WITH CHECK (((bucket_id = 'banners'::text) AND (auth.role() = 'authenticated'::text)));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can upload branding assets" ON storage.objects;
END $$;
CREATE POLICY "Admins can upload branding assets" ON storage.objects FOR INSERT WITH CHECK (((bucket_id = 'branding'::text) AND public.is_admin(auth.uid())));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can upload content media" ON storage.objects;
END $$;
CREATE POLICY "Admins can upload content media" ON storage.objects FOR INSERT TO authenticated WITH CHECK (((bucket_id = 'content-media'::text) AND public.has_role(auth.uid(), 'admin'::public.app_role)));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can upload level assets" ON storage.objects;
END $$;
CREATE POLICY "Admins can upload level assets" ON storage.objects FOR INSERT WITH CHECK (((bucket_id = 'level-assets'::text) AND public.is_admin(auth.uid())));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can upload party backgrounds" ON storage.objects;
END $$;
CREATE POLICY "Admins can upload party backgrounds" ON storage.objects FOR INSERT WITH CHECK (((bucket_id = 'party-backgrounds'::text) AND (auth.role() = 'authenticated'::text)));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can upload payment logos" ON storage.objects;
END $$;
CREATE POLICY "Admins can upload payment logos" ON storage.objects FOR INSERT WITH CHECK ((bucket_id = 'payment-logos'::text));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can view all recordings" ON storage.objects;
END $$;
CREATE POLICY "Admins can view all recordings" ON storage.objects FOR SELECT USING (((bucket_id = 'live-recordings'::text) AND (EXISTS ( SELECT 1 FROM public.user_roles WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = 'admin'::public.app_role))))));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Allow authenticated users to delete animations" ON storage.objects;
END $$;
CREATE POLICY "Allow authenticated users to delete animations" ON storage.objects FOR DELETE USING (((bucket_id = 'animations'::text) AND (auth.role() = 'authenticated'::text)));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Allow authenticated users to update animations" ON storage.objects;
END $$;
CREATE POLICY "Allow authenticated users to update animations" ON storage.objects FOR UPDATE USING (((bucket_id = 'animations'::text) AND (auth.role() = 'authenticated'::text)));

-- === RLS Batch 9 ===
DO $$ BEGIN
  DROP POLICY IF EXISTS "Allow authenticated users to upload animations" ON storage.objects;
END $$;
CREATE POLICY "Allow authenticated users to upload animations" ON storage.objects FOR INSERT WITH CHECK (((bucket_id = 'animations'::text) AND (auth.role() = 'authenticated'::text)));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Allow public read access on animations" ON storage.objects;
END $$;
CREATE POLICY "Allow public read access on animations" ON storage.objects FOR SELECT USING ((bucket_id = 'animations'::text));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can view app icons" ON storage.objects;
END $$;
CREATE POLICY "Anyone can view app icons" ON storage.objects FOR SELECT USING ((bucket_id = 'app-icons'::text));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can view avatars" ON storage.objects;
END $$;
CREATE POLICY "Anyone can view avatars" ON storage.objects FOR SELECT USING ((bucket_id = 'avatars'::text));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can view branding assets" ON storage.objects;
END $$;
CREATE POLICY "Anyone can view branding assets" ON storage.objects FOR SELECT USING ((bucket_id = 'branding'::text));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can view content media" ON storage.objects;
END $$;
CREATE POLICY "Anyone can view content media" ON storage.objects FOR SELECT USING ((bucket_id = 'content-media'::text));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can view helper screenshots" ON storage.objects;
END $$;
CREATE POLICY "Anyone can view helper screenshots" ON storage.objects FOR SELECT USING ((bucket_id = 'helper-screenshots'::text));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can view level assets" ON storage.objects;
END $$;
CREATE POLICY "Anyone can view level assets" ON storage.objects FOR SELECT USING ((bucket_id = 'level-assets'::text));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can view rating screenshots" ON storage.objects;
END $$;
CREATE POLICY "Anyone can view rating screenshots" ON storage.objects FOR SELECT USING ((bucket_id = 'rating-screenshots'::text));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can view reels videos" ON storage.objects;
END $$;
CREATE POLICY "Anyone can view reels videos" ON storage.objects FOR SELECT USING ((bucket_id = 'reels'::text));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can view shop items" ON storage.objects;
END $$;
CREATE POLICY "Anyone can view shop items" ON storage.objects FOR SELECT USING ((bucket_id = 'shop-items'::text));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Assets are publicly accessible" ON storage.objects;
END $$;
CREATE POLICY "Assets are publicly accessible" ON storage.objects FOR SELECT USING ((bucket_id = 'assets'::text));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Authenticated users can delete app icons" ON storage.objects;
END $$;
CREATE POLICY "Authenticated users can delete app icons" ON storage.objects FOR DELETE TO authenticated USING ((bucket_id = 'app-icons'::text));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Authenticated users can delete app-assets" ON storage.objects;
END $$;
CREATE POLICY "Authenticated users can delete app-assets" ON storage.objects FOR DELETE USING (((bucket_id = 'app-assets'::text) AND (auth.role() = 'authenticated'::text)));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Authenticated users can delete assets" ON storage.objects;
END $$;
CREATE POLICY "Authenticated users can delete assets" ON storage.objects FOR DELETE USING (((bucket_id = 'assets'::text) AND (auth.role() = 'authenticated'::text)));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Authenticated users can delete channel logos" ON storage.objects;
END $$;
CREATE POLICY "Authenticated users can delete channel logos" ON storage.objects FOR DELETE USING ((bucket_id = 'channel-logos'::text));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Authenticated users can delete frames" ON storage.objects;
END $$;
CREATE POLICY "Authenticated users can delete frames" ON storage.objects FOR DELETE USING ((bucket_id = 'frames'::text));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Authenticated users can delete media files" ON storage.objects;
END $$;
CREATE POLICY "Authenticated users can delete media files" ON storage.objects FOR DELETE USING ((bucket_id = 'media-files'::text));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Authenticated users can delete sounds" ON storage.objects;
END $$;
CREATE POLICY "Authenticated users can delete sounds" ON storage.objects FOR DELETE USING (((bucket_id = 'sounds'::text) AND (auth.role() = 'authenticated'::text)));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Authenticated users can update app icons" ON storage.objects;
END $$;
CREATE POLICY "Authenticated users can update app icons" ON storage.objects FOR UPDATE TO authenticated USING ((bucket_id = 'app-icons'::text));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Authenticated users can update app-assets" ON storage.objects;
END $$;
CREATE POLICY "Authenticated users can update app-assets" ON storage.objects FOR UPDATE USING (((bucket_id = 'app-assets'::text) AND (auth.role() = 'authenticated'::text)));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Authenticated users can update assets" ON storage.objects;
END $$;
CREATE POLICY "Authenticated users can update assets" ON storage.objects FOR UPDATE USING (((bucket_id = 'assets'::text) AND (auth.role() = 'authenticated'::text)));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Authenticated users can update channel logos" ON storage.objects;
END $$;
CREATE POLICY "Authenticated users can update channel logos" ON storage.objects FOR UPDATE USING ((bucket_id = 'channel-logos'::text));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Authenticated users can update media files" ON storage.objects;
END $$;
CREATE POLICY "Authenticated users can update media files" ON storage.objects FOR UPDATE USING ((bucket_id = 'media-files'::text));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Authenticated users can upload app icons" ON storage.objects;
END $$;
CREATE POLICY "Authenticated users can upload app icons" ON storage.objects FOR INSERT TO authenticated WITH CHECK ((bucket_id = 'app-icons'::text));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Authenticated users can upload app-assets" ON storage.objects;
END $$;
CREATE POLICY "Authenticated users can upload app-assets" ON storage.objects FOR INSERT WITH CHECK (((bucket_id = 'app-assets'::text) AND (auth.role() = 'authenticated'::text)));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Authenticated users can upload assets" ON storage.objects;
END $$;
CREATE POLICY "Authenticated users can upload assets" ON storage.objects FOR INSERT WITH CHECK (((bucket_id = 'assets'::text) AND (auth.role() = 'authenticated'::text)));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Authenticated users can upload avatars" ON storage.objects;
END $$;
CREATE POLICY "Authenticated users can upload avatars" ON storage.objects FOR INSERT WITH CHECK (((bucket_id = 'avatars'::text) AND (auth.role() = 'authenticated'::text)));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Authenticated users can upload channel logos" ON storage.objects;
END $$;
CREATE POLICY "Authenticated users can upload channel logos" ON storage.objects FOR INSERT WITH CHECK ((bucket_id = 'channel-logos'::text));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Authenticated users can upload chat media" ON storage.objects;
END $$;
CREATE POLICY "Authenticated users can upload chat media" ON storage.objects FOR INSERT WITH CHECK (((bucket_id = 'chat-media'::text) AND (auth.role() = 'authenticated'::text)));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Authenticated users can upload frames" ON storage.objects;
END $$;
CREATE POLICY "Authenticated users can upload frames" ON storage.objects FOR INSERT WITH CHECK ((bucket_id = 'frames'::text));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Authenticated users can upload helper screenshots" ON storage.objects;
END $$;
CREATE POLICY "Authenticated users can upload helper screenshots" ON storage.objects FOR INSERT WITH CHECK (((bucket_id = 'helper-screenshots'::text) AND (auth.role() = 'authenticated'::text)));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Authenticated users can upload media files" ON storage.objects;
END $$;
CREATE POLICY "Authenticated users can upload media files" ON storage.objects FOR INSERT WITH CHECK ((bucket_id = 'media-files'::text));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Authenticated users can upload payment screenshots" ON storage.objects;
END $$;
CREATE POLICY "Authenticated users can upload payment screenshots" ON storage.objects FOR INSERT TO authenticated WITH CHECK ((bucket_id = 'payment-screenshots'::text));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Authenticated users can upload reels" ON storage.objects;
END $$;
CREATE POLICY "Authenticated users can upload reels" ON storage.objects FOR INSERT WITH CHECK (((bucket_id = 'reels'::text) AND (auth.uid() IS NOT NULL)));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Authenticated users can upload sounds" ON storage.objects;
END $$;
CREATE POLICY "Authenticated users can upload sounds" ON storage.objects FOR INSERT WITH CHECK (((bucket_id = 'sounds'::text) AND (auth.role() = 'authenticated'::text)));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Authenticated users can upload support attachments" ON storage.objects;
END $$;
CREATE POLICY "Authenticated users can upload support attachments" ON storage.objects FOR INSERT WITH CHECK (((bucket_id = 'support-attachments'::text) AND (auth.uid() IS NOT NULL) AND ((storage.foldername(name))[1] = (auth.uid())::text)));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Banners are publicly accessible" ON storage.objects;
END $$;
CREATE POLICY "Banners are publicly accessible" ON storage.objects FOR SELECT USING ((bucket_id = 'banners'::text));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Channel logos are publicly accessible" ON storage.objects;
END $$;
CREATE POLICY "Channel logos are publicly accessible" ON storage.objects FOR SELECT USING ((bucket_id = 'channel-logos'::text));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Party backgrounds are publicly accessible" ON storage.objects;
END $$;
CREATE POLICY "Party backgrounds are publicly accessible" ON storage.objects FOR SELECT USING ((bucket_id = 'party-backgrounds'::text));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Payment logos are publicly accessible" ON storage.objects;
END $$;
CREATE POLICY "Payment logos are publicly accessible" ON storage.objects FOR SELECT USING ((bucket_id = 'payment-logos'::text));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Payment proofs are publicly readable" ON storage.objects;
END $$;
CREATE POLICY "Payment proofs are publicly readable" ON storage.objects FOR SELECT USING ((bucket_id = 'payment-proofs'::text));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Poster images are publicly accessible" ON storage.objects;
END $$;
CREATE POLICY "Poster images are publicly accessible" ON storage.objects FOR SELECT USING ((bucket_id = 'posters'::text));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Public can view chat media" ON storage.objects;
END $$;
CREATE POLICY "Public can view chat media" ON storage.objects FOR SELECT USING ((bucket_id = 'chat-media'::text));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Public can view media files" ON storage.objects;
END $$;
CREATE POLICY "Public can view media files" ON storage.objects FOR SELECT USING ((bucket_id = 'media-files'::text));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Public can view payment screenshots" ON storage.objects;
END $$;
CREATE POLICY "Public can view payment screenshots" ON storage.objects FOR SELECT USING ((bucket_id = 'payment-screenshots'::text));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Public read access for app-assets" ON storage.objects;
END $$;
CREATE POLICY "Public read access for app-assets" ON storage.objects FOR SELECT USING ((bucket_id = 'app-assets'::text));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Public read access for face-verification" ON storage.objects;
END $$;
CREATE POLICY "Public read access for face-verification" ON storage.objects FOR SELECT USING ((bucket_id = 'face-verification'::text));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Public read access for frames" ON storage.objects;
END $$;
CREATE POLICY "Public read access for frames" ON storage.objects FOR SELECT USING ((bucket_id = 'frames'::text));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Public read chat-bubbles" ON storage.objects;
END $$;
CREATE POLICY "Public read chat-bubbles" ON storage.objects FOR SELECT USING ((bucket_id = 'chat-bubbles'::text));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Public read noble-cards" ON storage.objects;
END $$;
CREATE POLICY "Public read noble-cards" ON storage.objects FOR SELECT USING ((bucket_id = 'noble-cards'::text));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Public read support attachments" ON storage.objects;
END $$;
CREATE POLICY "Public read support attachments" ON storage.objects FOR SELECT USING ((bucket_id = 'support-attachments'::text));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Public read vehicle-entrances" ON storage.objects;
END $$;
CREATE POLICY "Public read vehicle-entrances" ON storage.objects FOR SELECT USING ((bucket_id = 'vehicle-entrances'::text));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Public read vip-medals" ON storage.objects;
END $$;
CREATE POLICY "Public read vip-medals" ON storage.objects FOR SELECT USING ((bucket_id = 'vip-medals'::text));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Public sounds are viewable by everyone" ON storage.objects;
END $$;
CREATE POLICY "Public sounds are viewable by everyone" ON storage.objects FOR SELECT USING ((bucket_id = 'sounds'::text));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can delete own chat media" ON storage.objects;
END $$;
CREATE POLICY "Users can delete own chat media" ON storage.objects FOR DELETE TO authenticated USING (((bucket_id = 'chat-media'::text) AND ((auth.uid())::text = (storage.foldername(name))[1])));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can delete own payment screenshots" ON storage.objects;
END $$;
CREATE POLICY "Users can delete own payment screenshots" ON storage.objects FOR DELETE TO authenticated USING (((bucket_id = 'payment-screenshots'::text) AND ((auth.uid())::text = (storage.foldername(name))[2])));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can delete own support attachments" ON storage.objects;
END $$;
CREATE POLICY "Users can delete own support attachments" ON storage.objects FOR DELETE USING (((bucket_id = 'support-attachments'::text) AND ((auth.uid())::text = (storage.foldername(name))[1])));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can delete their own avatars" ON storage.objects;
END $$;
CREATE POLICY "Users can delete their own avatars" ON storage.objects FOR DELETE USING (((bucket_id = 'avatars'::text) AND ((auth.uid())::text = (storage.foldername(name))[1])));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can delete their own helper screenshots" ON storage.objects;
END $$;
CREATE POLICY "Users can delete their own helper screenshots" ON storage.objects FOR DELETE USING (((bucket_id = 'helper-screenshots'::text) AND ((auth.uid())::text = (storage.foldername(name))[1])));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can delete their own posters" ON storage.objects;
END $$;
CREATE POLICY "Users can delete their own posters" ON storage.objects FOR DELETE USING (((bucket_id = 'posters'::text) AND ((auth.uid())::text = (storage.foldername(name))[1])));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can delete their own reel files" ON storage.objects;
END $$;
CREATE POLICY "Users can delete their own reel files" ON storage.objects FOR DELETE USING (((bucket_id = 'reels'::text) AND ((auth.uid())::text = (storage.foldername(name))[1])));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can delete their own verification files" ON storage.objects;
END $$;
CREATE POLICY "Users can delete their own verification files" ON storage.objects FOR DELETE USING (((bucket_id = 'host-verification'::text) AND ((auth.uid())::text = (storage.foldername(name))[1])));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can update own payment screenshots" ON storage.objects;
END $$;
CREATE POLICY "Users can update own payment screenshots" ON storage.objects FOR UPDATE TO authenticated USING (((bucket_id = 'payment-screenshots'::text) AND ((auth.uid())::text = (storage.foldername(name))[2])));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can update own support attachments" ON storage.objects;
END $$;
CREATE POLICY "Users can update own support attachments" ON storage.objects FOR UPDATE USING (((bucket_id = 'support-attachments'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can update their own avatars" ON storage.objects;
END $$;
CREATE POLICY "Users can update their own avatars" ON storage.objects FOR UPDATE USING (((bucket_id = 'avatars'::text) AND ((auth.uid())::text = (storage.foldername(name))[1])));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can update their own face verification files" ON storage.objects;
END $$;
CREATE POLICY "Users can update their own face verification files" ON storage.objects FOR UPDATE USING (((bucket_id = 'face-verification'::text) AND ((auth.uid())::text = (storage.foldername(name))[1])));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can update their own posters" ON storage.objects;
END $$;
CREATE POLICY "Users can update their own posters" ON storage.objects FOR UPDATE USING (((bucket_id = 'posters'::text) AND ((auth.uid())::text = (storage.foldername(name))[1])));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can update their own reel files" ON storage.objects;
END $$;
CREATE POLICY "Users can update their own reel files" ON storage.objects FOR UPDATE USING (((bucket_id = 'reels'::text) AND ((auth.uid())::text = (storage.foldername(name))[1])));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can update their own verification files" ON storage.objects;
END $$;
CREATE POLICY "Users can update their own verification files" ON storage.objects FOR UPDATE USING (((bucket_id = 'host-verification'::text) AND ((auth.uid())::text = (storage.foldername(name))[1])));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can upload payment proofs" ON storage.objects;
END $$;
CREATE POLICY "Users can upload payment proofs" ON storage.objects FOR INSERT WITH CHECK (((bucket_id = 'payment-proofs'::text) AND (auth.role() = 'authenticated'::text)));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can upload rating screenshots" ON storage.objects;
END $$;
CREATE POLICY "Users can upload rating screenshots" ON storage.objects FOR INSERT WITH CHECK (((bucket_id = 'rating-screenshots'::text) AND (auth.uid() IS NOT NULL)));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can upload support attachments" ON storage.objects;
END $$;
CREATE POLICY "Users can upload support attachments" ON storage.objects FOR INSERT WITH CHECK (((bucket_id = 'support-attachments'::text) AND (auth.role() = 'authenticated'::text)));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can upload their own face verification files" ON storage.objects;
END $$;
CREATE POLICY "Users can upload their own face verification files" ON storage.objects FOR INSERT WITH CHECK (((bucket_id = 'face-verification'::text) AND ((auth.uid())::text = (storage.foldername(name))[1])));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can upload their own posters" ON storage.objects;
END $$;
CREATE POLICY "Users can upload their own posters" ON storage.objects FOR INSERT WITH CHECK (((bucket_id = 'posters'::text) AND ((auth.uid())::text = (storage.foldername(name))[1])));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can upload their own verification files" ON storage.objects;
END $$;
CREATE POLICY "Users can upload their own verification files" ON storage.objects FOR INSERT WITH CHECK (((bucket_id = 'host-verification'::text) AND ((auth.uid())::text = (storage.foldername(name))[1])));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can view their own face verification files" ON storage.objects;
END $$;
CREATE POLICY "Users can view their own face verification files" ON storage.objects FOR SELECT USING (((bucket_id = 'face-verification'::text) AND ((auth.uid())::text = (storage.foldername(name))[1])));

DO $$ BEGIN
  DROP POLICY IF EXISTS "Verification files are publicly accessible" ON storage.objects;
END $$;
CREATE POLICY "Verification files are publicly accessible" ON storage.objects FOR SELECT USING ((bucket_id = 'host-verification'::text));