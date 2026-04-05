-- Index Batch 2: 80 indexes

DO $$ BEGIN
  CREATE INDEX idx_gift_transactions_sender ON public.gift_transactions USING btree (sender_id, created_at DESC);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_gifts_category ON public.gifts USING btree (category);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_gifts_display_order ON public.gifts USING btree (display_order);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_group_messages_encrypted ON public.group_messages USING btree (is_encrypted) WHERE (is_encrypted = true);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_helper_admin_messages_created_at ON public.helper_admin_messages USING btree (created_at DESC);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_helper_admin_messages_helper_id ON public.helper_admin_messages USING btree (helper_id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_helper_admin_messages_is_read ON public.helper_admin_messages USING btree (is_read);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_helper_applications_status ON public.helper_applications USING btree (status);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_helper_applications_user_id ON public.helper_applications USING btree (user_id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_helper_diamond_packages_level ON public.helper_diamond_packages USING btree (level_number);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_helper_message_replies_message_id ON public.helper_message_replies USING btree (message_id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_helper_message_replies_sender_id ON public.helper_message_replies USING btree (sender_id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_helper_notifications_helper ON public.helper_notifications USING btree (helper_id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_helper_notifications_unread ON public.helper_notifications USING btree (helper_id, is_read);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_helper_orders_helper ON public.helper_orders USING btree (helper_id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_helper_orders_status ON public.helper_orders USING btree (status);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_helper_orders_user ON public.helper_orders USING btree (user_id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_helper_payment_methods_country ON public.helper_payment_methods USING btree (country_code);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_helper_payment_methods_helper ON public.helper_payment_methods USING btree (helper_id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_helper_topup_requests_helper ON public.helper_topup_requests USING btree (helper_id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_helper_topup_requests_status ON public.helper_topup_requests USING btree (status);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_helper_transactions_helper ON public.helper_transactions USING btree (helper_id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_helper_transactions_status ON public.helper_transactions USING btree (status);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_helper_upgrade_requests_helper ON public.helper_upgrade_requests USING btree (helper_id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_helper_upgrade_requests_status ON public.helper_upgrade_requests USING btree (status);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_helper_withdrawal_requests_helper ON public.helper_withdrawal_requests USING btree (helper_id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_helper_withdrawal_requests_status ON public.helper_withdrawal_requests USING btree (status);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_host_applications_created_at ON public.host_applications USING btree (created_at DESC);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_host_applications_pending ON public.host_applications USING btree (status) WHERE (status = 'pending'::text);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_host_applications_status ON public.host_applications USING btree (status);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_host_applications_user_id ON public.host_applications USING btree (user_id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_host_contact_violations_created_at ON public.host_contact_violations USING btree (created_at DESC);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_host_contact_violations_host_id ON public.host_contact_violations USING btree (host_id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_host_conversion_requests_status ON public.host_conversion_requests USING btree (status);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_host_conversion_requests_user_id ON public.host_conversion_requests USING btree (user_id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_icon_registry_category ON public.app_icon_registry USING btree (category);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_icon_registry_key ON public.app_icon_registry USING btree (icon_key);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_kids_content_featured ON public.kids_content USING btree (is_featured) WHERE (is_featured = true);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE UNIQUE INDEX idx_leaderboard_reward_history_unique ON public.leaderboard_reward_history USING btree (user_id, category, period_type, period_label);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_limited_offer_claims_user ON public.limited_offer_claims USING btree (user_id, offer_id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_live_bans_ban_end ON public.live_bans USING btree (ban_end) WHERE (is_active = true);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_live_bans_user_active ON public.live_bans USING btree (user_id, is_active);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_live_face_violations_created ON public.live_face_violations USING btree (created_at DESC);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_live_face_violations_host ON public.live_face_violations USING btree (host_id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_live_face_violations_reviewed ON public.live_face_violations USING btree (admin_reviewed);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_live_game_bets_round ON public.live_game_bets USING btree (round_id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_live_game_rounds_game_status ON public.live_game_rounds USING btree (game_id, status);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_live_game_rounds_global ON public.live_game_rounds USING btree (game_id) WHERE (room_id IS NULL);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_live_streams_active ON public.live_streams USING btree (is_active) WHERE ((is_active = true) AND (ended_at IS NULL));
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_live_streams_active_heartbeat ON public.live_streams USING btree (is_active, last_heartbeat) WHERE (is_active = true);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_live_streams_music_playing ON public.live_streams USING btree (music_playing) WHERE (music_playing = true);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_live_violations_user ON public.live_violations USING btree (user_id, created_at);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_login_attempts_cleanup ON public.login_attempts USING btree (attempt_at);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_login_attempts_identifier ON public.login_attempts USING btree (identifier, attempt_at DESC);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_messages_conversation ON public.messages USING btree (conversation_id, created_at DESC);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_messages_conversation_sender ON public.messages USING btree (conversation_id, sender_id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_messages_encrypted ON public.messages USING btree (is_encrypted) WHERE (is_encrypted = true);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_messages_is_read ON public.messages USING btree (is_read) WHERE (is_read = false);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_messages_status ON public.messages USING btree (conversation_id, status) WHERE (status <> 'read'::text);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_moderation_logs_created_at ON public.chat_moderation_logs USING btree (created_at DESC);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_moderation_logs_user_id ON public.chat_moderation_logs USING btree (user_id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_moderation_logs_violation_type ON public.chat_moderation_logs USING btree (violation_type);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_new_host_bonus_user ON public.new_host_live_bonus_progress USING btree (user_id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_notifications_created_at ON public.notifications USING btree (created_at DESC);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_notifications_unread ON public.notifications USING btree (user_id, is_read) WHERE (is_read = false);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_notifications_user ON public.notifications USING btree (user_id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_party_room_backgrounds_active ON public.party_room_backgrounds USING btree (is_active, display_order);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_party_room_messages_room ON public.party_room_messages USING btree (room_id, created_at DESC);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_party_room_participants_room ON public.party_room_participants USING btree (room_id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_party_room_participants_user ON public.party_room_participants USING btree (user_id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_party_rooms_active ON public.party_rooms USING btree (is_active) WHERE (is_active = true);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_party_rooms_host ON public.party_rooms USING btree (host_id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_payment_gateways_active ON public.payment_gateways USING btree (is_active);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_payment_transactions_created ON public.payment_transactions USING btree (created_at DESC);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_payment_transactions_status ON public.payment_transactions USING btree (status);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_payment_transactions_user ON public.payment_transactions USING btree (user_id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;