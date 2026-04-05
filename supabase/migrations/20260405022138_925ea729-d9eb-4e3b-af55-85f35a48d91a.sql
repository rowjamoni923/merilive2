-- Index Batch 3+4: 112 indexes

DO $$ BEGIN
  CREATE INDEX idx_payment_transactions_user_id ON public.payment_transactions USING btree (user_id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_payroll_requests_agency_id ON public.payroll_requests USING btree (agency_id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_payroll_requests_status ON public.payroll_requests USING btree (status);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_phone_otps_expires ON public.phone_otps USING btree (expires_at);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_phone_otps_phone ON public.phone_otps USING btree (phone_number, is_used);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_pk_battles_challenger ON public.pk_battles USING btree (challenger_id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_pk_battles_opponent ON public.pk_battles USING btree (opponent_id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_pk_battles_status ON public.pk_battles USING btree (status);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_pk_competitions_status ON public.pk_competitions USING btree (status, end_date);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_pk_participants_competition ON public.pk_participants USING btree (competition_id, score DESC);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_pk_participants_user ON public.pk_participants USING btree (user_id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_poster_images_user_id ON public.poster_images USING btree (user_id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_private_calls_created ON public.private_calls USING btree (created_at);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_private_calls_created_at ON public.private_calls USING btree (created_at DESC);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_private_calls_earnings_not_credited ON public.private_calls USING btree (host_id, host_earnings_credited) WHERE ((host_earnings_credited = false) AND (status = 'ended'::text));
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_profiles_app_uid ON public.profiles USING btree (app_uid);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_profiles_created_at ON public.profiles USING btree (created_at DESC);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_profiles_deletion ON public.profiles USING btree (deletion_scheduled_at) WHERE (deletion_scheduled_at IS NOT NULL);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_profiles_device_id ON public.profiles USING btree (device_id) WHERE (device_id IS NOT NULL);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_profiles_entry_name_bar ON public.profiles USING btree (equipped_entry_name_bar_id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_profiles_face_hash ON public.profiles USING btree (face_hash) WHERE (face_hash IS NOT NULL);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_profiles_is_blocked ON public.profiles USING btree (is_blocked) WHERE (is_blocked = true);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_profiles_is_host ON public.profiles USING btree (is_host) WHERE (is_host = true);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_profiles_is_online ON public.profiles USING btree (is_online) WHERE (is_online = true);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_profiles_online_status ON public.profiles USING btree (is_online, last_seen_at) WHERE (is_online = true);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE UNIQUE INDEX idx_profiles_unique_device_id ON public.profiles USING btree (device_id) WHERE ((device_id IS NOT NULL) AND (is_deleted = false));
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_provider_games_active ON public.provider_games USING btree (is_active);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_provider_games_provider ON public.provider_games USING btree (provider_id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_rate_limit_lookup ON public.rate_limit_attempts USING btree (identifier, action_type, attempted_at DESC);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_rate_limits_user_endpoint ON public.rate_limits USING btree (user_id, endpoint, window_start);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE UNIQUE INDEX idx_rating_reward_claims_user ON public.rating_reward_claims USING btree (user_id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_recharge_agency ON public.recharge_transactions USING btree (agency_id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_recharge_purchase_source ON public.recharge_transactions USING btree (purchase_source);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_recharge_transactions_created ON public.recharge_transactions USING btree (created_at);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_recharge_transactions_created_at ON public.recharge_transactions USING btree (created_at DESC);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_recharge_user ON public.recharge_transactions USING btree (user_id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_reconciliation_event ON public.payment_reconciliation_log USING btree (event_type, created_at DESC);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_reconciliation_gateway ON public.payment_reconciliation_log USING btree (gateway, created_at DESC);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_reconciliation_order ON public.payment_reconciliation_log USING btree (order_id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_reconciliation_user ON public.payment_reconciliation_log USING btree (user_id, created_at DESC);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_recovery_tokens_device ON public.recovery_tokens USING btree (device_id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_recovery_tokens_token ON public.recovery_tokens USING btree (token) WHERE (is_used = false);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_reels_sound_title ON public.reels USING btree (sound_title);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_role_frames_active ON public.role_frames USING btree (is_active);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_role_frames_role_type ON public.role_frames USING btree (role_type);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_roulette_bets_session ON public.roulette_bets USING btree (session_id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_roulette_bets_user ON public.roulette_bets USING btree (user_id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_roulette_sessions_status ON public.roulette_sessions USING btree (status);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_seat_invitations_invitee_id ON public.seat_invitations USING btree (invitee_id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_seat_invitations_room_id ON public.seat_invitations USING btree (room_id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_seat_invitations_status ON public.seat_invitations USING btree (status);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_seat_requests_room_id ON public.seat_requests USING btree (room_id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_seat_requests_status ON public.seat_requests USING btree (status);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_security_alerts_created ON public.security_alerts USING btree (created_at DESC);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_security_alerts_severity ON public.security_alerts USING btree (severity) WHERE (is_resolved = false);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_security_alerts_type ON public.security_alerts USING btree (alert_type);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_security_alerts_user ON public.security_alerts USING btree (user_id) WHERE (user_id IS NOT NULL);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_security_audit_action ON public.security_audit_log USING btree (action, created_at);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_security_audit_user ON public.security_audit_log USING btree (user_id, created_at);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_session_security_event ON public.session_security_logs USING btree (event_type, created_at DESC);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_session_security_logs_created_at ON public.session_security_logs USING btree (created_at DESC);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_session_security_user ON public.session_security_logs USING btree (user_id, created_at DESC);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_shop_items_category ON public.shop_items USING btree (category);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_shop_items_featured ON public.shop_items USING btree (is_featured) WHERE (is_featured = true);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_shop_items_type ON public.shop_items USING btree (item_type);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_special_gifts_active ON public.special_gifts USING btree (is_active, display_order);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_special_gifts_date_range ON public.special_gifts USING btree (start_date, end_date);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_stream_chat_messages_stream ON public.stream_chat_messages USING btree (stream_id, created_at DESC);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_stream_gifts_stream ON public.stream_gifts USING btree (stream_id, created_at DESC);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_stream_recordings_stream ON public.stream_recordings USING btree (stream_id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_stream_viewers_stream ON public.stream_viewers USING btree (stream_id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_stream_viewers_user ON public.stream_viewers USING btree (user_id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_sub_agent_commissions_agent ON public.sub_agent_commissions USING btree (sub_agent_id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_sub_agent_referrals_agent ON public.sub_agent_referrals USING btree (sub_agent_id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_sub_agents_agency ON public.sub_agents USING btree (agency_id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_sub_agents_user ON public.sub_agents USING btree (user_id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_support_messages_ticket ON public.support_messages USING btree (ticket_id, created_at);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_support_tickets_status ON public.support_tickets USING btree (status);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_support_tickets_user ON public.support_tickets USING btree (user_id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_topup_helpers_country ON public.topup_helpers USING btree (country_code);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_topup_helpers_status ON public.topup_helpers USING btree (status);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_topup_helpers_user ON public.topup_helpers USING btree (user_id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_user_beans_exchange_user ON public.user_beans_exchange_history USING btree (user_id, created_at DESC);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_user_blocks_blocked ON public.user_blocks USING btree (blocked_id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_user_blocks_blocker ON public.user_blocks USING btree (blocker_id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_user_entry_banners_user ON public.user_entry_banners USING btree (user_id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_user_invitations_inviter ON public.user_invitations USING btree (inviter_id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_user_parcels_user ON public.user_parcels USING btree (user_id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_user_purchases_item ON public.user_purchases USING btree (item_id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_user_purchases_user ON public.user_purchases USING btree (user_id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_user_reports_created ON public.user_reports USING btree (created_at DESC);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_user_reports_reported ON public.user_reports USING btree (reported_user_id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_user_reports_reporter ON public.user_reports USING btree (reporter_id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_user_reports_status ON public.user_reports USING btree (status);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_user_role_frames_user ON public.user_role_frames USING btree (user_id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_user_task_progress_date ON public.user_task_progress USING btree (task_date);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_user_task_progress_user ON public.user_task_progress USING btree (user_id, task_date);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_user_vip_subscriptions_active ON public.user_vip_subscriptions USING btree (is_active) WHERE (is_active = true);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_user_vip_subscriptions_user ON public.user_vip_subscriptions USING btree (user_id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_vip_tiers_active ON public.vip_tiers USING btree (is_active, level);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_vpn_detection_logs_user ON public.vpn_detection_logs USING btree (user_id, detected_at DESC);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_watchlist_content ON public.watchlist USING btree (content_id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_watchlist_user ON public.watchlist USING btree (user_id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_weekly_earnings_period ON public.host_weekly_earnings USING btree (week_start, week_end);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;