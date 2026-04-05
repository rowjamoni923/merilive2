-- Index Batch 1: 80 indexes

DO $$ BEGIN
  CREATE INDEX idx_admin_devices_admin_user ON public.admin_allowed_devices USING btree (admin_user_id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_admin_devices_fingerprint ON public.admin_allowed_devices USING btree (device_fingerprint);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_admin_devices_status ON public.admin_allowed_devices USING btree (status);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_admin_login_otps_email ON public.admin_login_otps USING btree (email, is_used, expires_at);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_admin_music_active ON public.admin_music_library USING btree (is_active);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_admin_music_category ON public.admin_music_library USING btree (category);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_admin_notices_active ON public.admin_notices USING btree (is_active, expires_at);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_admin_notices_created ON public.admin_notices USING btree (created_at DESC);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_admin_notices_target ON public.admin_notices USING gin (target_audience);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_agencies_is_active ON public.agencies USING btree (is_active) WHERE (is_active = true);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_agencies_is_blocked ON public.agencies USING btree (is_blocked) WHERE (is_blocked = true);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_agencies_owner ON public.agencies USING btree (owner_id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_agencies_parent_agency_id ON public.agencies USING btree (parent_agency_id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_agency_commission_history_agency ON public.agency_commission_history USING btree (agency_id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_agency_commission_history_created ON public.agency_commission_history USING btree (created_at DESC);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_agency_commission_history_host ON public.agency_commission_history USING btree (host_id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_agency_diamond_transactions_agency_id ON public.agency_diamond_transactions USING btree (agency_id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_agency_diamond_transactions_created_at ON public.agency_diamond_transactions USING btree (created_at DESC);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_agency_hosts_agency ON public.agency_hosts USING btree (agency_id, status);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_agency_hosts_host ON public.agency_hosts USING btree (host_id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_agency_withdrawals_country ON public.agency_withdrawals USING btree (country_code);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_agency_withdrawals_helper ON public.agency_withdrawals USING btree (assigned_helper_id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_allowed_external_links_active ON public.allowed_external_links USING btree (is_active) WHERE (is_active = true);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_allowed_external_links_pattern ON public.allowed_external_links USING btree (url_pattern);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_app_event_themes_country_active ON public.app_event_themes USING btree (country_code, is_active, display_order);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_app_event_themes_country_code ON public.app_event_themes USING btree (country_code);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_ar_stickers_active ON public.ar_stickers USING btree (is_active, display_order);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_ar_stickers_category ON public.ar_stickers USING btree (category);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_avatar_frames_active ON public.avatar_frames USING btree (is_active) WHERE (is_active = true);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_avatar_frames_category ON public.avatar_frames USING btree (category);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_avatar_frames_type ON public.avatar_frames USING btree (frame_type);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_beauty_filters_active ON public.beauty_filters USING btree (is_active, display_order);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_beauty_filters_category ON public.beauty_filters USING btree (category);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_blocked_ips_address ON public.blocked_ips USING btree (ip_address);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_channels_active ON public.channels USING btree (is_active);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_channels_category ON public.channels USING btree (category);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_channels_country ON public.channels USING btree (country_code);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_channels_featured ON public.channels USING btree (is_featured) WHERE (is_featured = true);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_channels_is_premium ON public.channels USING btree (is_premium);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_coin_transfers_receiver ON public.coin_transfers USING btree (receiver_id, created_at DESC);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_coin_transfers_sender ON public.coin_transfers USING btree (sender_id, created_at DESC);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_consumption_return_user ON public.consumption_return_history USING btree (user_id, period_label);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_conv_encryption_keys_lookup ON public.conversation_encryption_keys USING btree (conversation_id, user_id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_conversations_last_message ON public.conversations USING btree (last_message_at DESC);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_conversations_participant_1 ON public.conversations USING btree (participant_1);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_conversations_participant_2 ON public.conversations USING btree (participant_2);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_daily_login_claims_date ON public.daily_login_claims USING btree (claimed_date);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE UNIQUE INDEX idx_daily_login_claims_unique ON public.daily_login_claims USING btree (user_id, claimed_date);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_device_tokens_active ON public.device_tokens USING btree (is_active) WHERE (is_active = true);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_device_tokens_token ON public.device_tokens USING btree (token);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_device_tokens_user_id ON public.device_tokens USING btree (user_id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_email_otps_email_purpose ON public.email_otps USING btree (email, purpose, is_used, expires_at);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_email_otps_expires ON public.email_otps USING btree (expires_at);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_entertainment_featured ON public.entertainment USING btree (is_featured) WHERE (is_featured = true);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_entry_banners_active ON public.entry_banners USING btree (is_active, display_order);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_entry_name_bars_active ON public.entry_name_bars USING btree (is_active, display_order);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_error_logs_created_at ON public.system_error_logs USING btree (created_at DESC);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_error_logs_is_resolved ON public.system_error_logs USING btree (is_resolved);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_error_logs_page_path ON public.system_error_logs USING btree (page_path);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_face_records_embedding ON public.face_records USING btree (face_embedding);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_face_verification_duplicate ON public.face_verification_submissions USING btree (is_duplicate_face) WHERE (is_duplicate_face = true);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_failed_logins_email ON public.failed_login_attempts USING btree (email, last_attempt_at);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_first_recharge_claims_user ON public.first_recharge_claims USING btree (user_id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_followers_follower ON public.followers USING btree (follower_id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_followers_following ON public.followers USING btree (following_id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_game_bets_session ON public.game_bets USING btree (session_id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_game_players_session ON public.game_players USING btree (session_id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_game_players_user ON public.game_players USING btree (user_id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_game_sessions_created_at ON public.game_sessions USING btree (created_at DESC);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_game_sessions_room ON public.game_sessions USING btree (room_id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_game_transactions_user ON public.game_transactions USING btree (user_id, created_at DESC);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_gift_transaction_logs_created_at ON public.gift_transaction_logs USING btree (created_at DESC);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_gift_transaction_logs_receiver ON public.gift_transaction_logs USING btree (receiver_id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_gift_transaction_logs_sender ON public.gift_transaction_logs USING btree (sender_id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_gift_transactions_created ON public.gift_transactions USING btree (created_at DESC);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_gift_transactions_receiver ON public.gift_transactions USING btree (receiver_id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_gift_transactions_sender ON public.gift_transactions USING btree (sender_id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_gifts_active ON public.gifts USING btree (is_active) WHERE (is_active = true);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_gifts_category ON public.gifts USING btree (category);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;