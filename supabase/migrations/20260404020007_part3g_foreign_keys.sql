DO $$ BEGIN
  ALTER TABLE ONLY public.admin_allowed_devices
    ADD CONSTRAINT admin_allowed_devices_admin_user_id_fkey FOREIGN KEY (admin_user_id) REFERENCES public.admin_users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.admin_allowed_devices
    ADD CONSTRAINT admin_allowed_devices_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES public.admin_users(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.admin_invitations
    ADD CONSTRAINT admin_invitations_invited_by_fkey FOREIGN KEY (invited_by) REFERENCES auth.users(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.admin_logs
    ADD CONSTRAINT admin_logs_admin_id_fkey FOREIGN KEY (admin_id) REFERENCES auth.users(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.admin_notices
    ADD CONSTRAINT admin_notices_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.admin_section_permissions
    ADD CONSTRAINT admin_section_permissions_admin_user_id_fkey FOREIGN KEY (admin_user_id) REFERENCES public.admin_users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.admin_section_permissions
    ADD CONSTRAINT admin_section_permissions_granted_by_fkey FOREIGN KEY (granted_by) REFERENCES auth.users(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.admin_section_permissions
    ADD CONSTRAINT admin_section_permissions_section_id_fkey FOREIGN KEY (section_id) REFERENCES public.admin_sections(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.admin_users
    ADD CONSTRAINT admin_users_invited_by_fkey FOREIGN KEY (invited_by) REFERENCES auth.users(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.admin_users
    ADD CONSTRAINT admin_users_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.agencies
    ADD CONSTRAINT agencies_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.agencies
    ADD CONSTRAINT agencies_parent_agency_id_fkey FOREIGN KEY (parent_agency_id) REFERENCES public.agencies(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.agency_commission_history
    ADD CONSTRAINT agency_commission_history_agency_id_fkey FOREIGN KEY (agency_id) REFERENCES public.agencies(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.agency_commission_history
    ADD CONSTRAINT agency_commission_history_host_id_fkey FOREIGN KEY (host_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.agency_diamond_transactions
    ADD CONSTRAINT agency_diamond_transactions_agency_id_fkey FOREIGN KEY (agency_id) REFERENCES public.agencies(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.agency_diamond_transactions
    ADD CONSTRAINT agency_diamond_transactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.agency_earnings_transfers
    ADD CONSTRAINT agency_earnings_transfers_agency_id_fkey FOREIGN KEY (agency_id) REFERENCES public.agencies(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.agency_earnings_transfers
    ADD CONSTRAINT agency_earnings_transfers_host_id_fkey FOREIGN KEY (host_id) REFERENCES public.profiles(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.agency_hosts
    ADD CONSTRAINT agency_hosts_agency_id_fkey FOREIGN KEY (agency_id) REFERENCES public.agencies(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.agency_hosts
    ADD CONSTRAINT agency_hosts_host_id_fkey FOREIGN KEY (host_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.agency_performance
    ADD CONSTRAINT agency_performance_agency_id_fkey FOREIGN KEY (agency_id) REFERENCES public.agencies(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.agency_rankings
    ADD CONSTRAINT agency_rankings_agency_id_fkey FOREIGN KEY (agency_id) REFERENCES public.agencies(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.agency_withdrawals
    ADD CONSTRAINT agency_withdrawals_agency_id_fkey FOREIGN KEY (agency_id) REFERENCES public.agencies(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.agency_withdrawals
    ADD CONSTRAINT agency_withdrawals_assigned_helper_id_fkey FOREIGN KEY (assigned_helper_id) REFERENCES public.topup_helpers(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.app_content
    ADD CONSTRAINT app_content_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.banned_devices
    ADD CONSTRAINT banned_devices_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.call_events
    ADD CONSTRAINT call_events_call_id_fkey FOREIGN KEY (call_id) REFERENCES public.private_calls(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.chat_moderation_logs
    ADD CONSTRAINT chat_moderation_logs_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES public.profiles(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.chat_moderation_logs
    ADD CONSTRAINT chat_moderation_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.content_audio_tracks
    ADD CONSTRAINT content_audio_tracks_content_id_fkey FOREIGN KEY (content_id) REFERENCES public.site_content(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.content_subtitles
    ADD CONSTRAINT content_subtitles_content_id_fkey FOREIGN KEY (content_id) REFERENCES public.site_content(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_participant_1_fkey FOREIGN KEY (participant_1) REFERENCES public.profiles(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_participant_2_fkey FOREIGN KEY (participant_2) REFERENCES public.profiles(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.device_tokens
    ADD CONSTRAINT device_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.face_records
    ADD CONSTRAINT face_records_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.face_verification_submissions
    ADD CONSTRAINT face_verification_submissions_duplicate_face_user_id_fkey FOREIGN KEY (duplicate_face_user_id) REFERENCES public.profiles(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.face_verification_submissions
    ADD CONSTRAINT face_verification_submissions_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES auth.users(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.face_verification_submissions
    ADD CONSTRAINT face_verification_submissions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.followers
    ADD CONSTRAINT followers_follower_id_fkey FOREIGN KEY (follower_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.followers
    ADD CONSTRAINT followers_following_id_fkey FOREIGN KEY (following_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.game_bets
    ADD CONSTRAINT game_bets_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.game_sessions(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.game_bets
    ADD CONSTRAINT game_bets_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.game_players
    ADD CONSTRAINT game_players_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.game_sessions(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.game_players
    ADD CONSTRAINT game_players_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.game_provider_logs
    ADD CONSTRAINT game_provider_logs_provider_id_fkey FOREIGN KEY (provider_id) REFERENCES public.game_providers(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.game_sessions
    ADD CONSTRAINT game_sessions_room_id_fkey FOREIGN KEY (room_id) REFERENCES public.party_rooms(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.game_sessions
    ADD CONSTRAINT game_sessions_winner_id_fkey FOREIGN KEY (winner_id) REFERENCES public.profiles(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.game_transactions
    ADD CONSTRAINT game_transactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.gift_transaction_logs
    ADD CONSTRAINT gift_transaction_logs_credited_by_fkey FOREIGN KEY (credited_by) REFERENCES public.profiles(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.gift_transaction_logs
    ADD CONSTRAINT gift_transaction_logs_gift_id_fkey FOREIGN KEY (gift_id) REFERENCES public.gifts(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.gift_transaction_logs
    ADD CONSTRAINT gift_transaction_logs_receiver_id_fkey FOREIGN KEY (receiver_id) REFERENCES public.profiles(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.gift_transaction_logs
    ADD CONSTRAINT gift_transaction_logs_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES public.profiles(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.gift_transaction_logs
    ADD CONSTRAINT gift_transaction_logs_transaction_id_fkey FOREIGN KEY (transaction_id) REFERENCES public.gift_transactions(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.gift_transactions
    ADD CONSTRAINT gift_transactions_gift_id_fkey FOREIGN KEY (gift_id) REFERENCES public.gifts(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.gift_transactions
    ADD CONSTRAINT gift_transactions_party_room_id_fkey FOREIGN KEY (party_room_id) REFERENCES public.party_rooms(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.gift_transactions
    ADD CONSTRAINT gift_transactions_receiver_id_fkey FOREIGN KEY (receiver_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.gift_transactions
    ADD CONSTRAINT gift_transactions_reel_id_fkey FOREIGN KEY (reel_id) REFERENCES public.reels(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.gift_transactions
    ADD CONSTRAINT gift_transactions_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.group_members
    ADD CONSTRAINT group_members_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.groups(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.group_members
    ADD CONSTRAINT group_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.group_messages
    ADD CONSTRAINT group_messages_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.groups(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.group_messages
    ADD CONSTRAINT group_messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES public.profiles(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.groups
    ADD CONSTRAINT groups_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES public.profiles(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.helper_admin_messages
    ADD CONSTRAINT helper_admin_messages_helper_id_fkey FOREIGN KEY (helper_id) REFERENCES public.topup_helpers(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.helper_admin_messages
    ADD CONSTRAINT helper_admin_messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES auth.users(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.helper_applications
    ADD CONSTRAINT helper_applications_agency_id_fkey FOREIGN KEY (agency_id) REFERENCES public.agencies(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.helper_applications
    ADD CONSTRAINT helper_applications_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.helper_assigned_countries
    ADD CONSTRAINT helper_assigned_countries_helper_id_fkey FOREIGN KEY (helper_id) REFERENCES public.topup_helpers(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.helper_country_payment_methods
    ADD CONSTRAINT helper_country_payment_methods_helper_id_fkey FOREIGN KEY (helper_id) REFERENCES public.topup_helpers(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.helper_message_replies
    ADD CONSTRAINT helper_message_replies_message_id_fkey FOREIGN KEY (message_id) REFERENCES public.helper_admin_messages(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.helper_notifications
    ADD CONSTRAINT helper_notifications_helper_id_fkey FOREIGN KEY (helper_id) REFERENCES public.topup_helpers(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.helper_orders
    ADD CONSTRAINT helper_orders_helper_id_fkey FOREIGN KEY (helper_id) REFERENCES public.topup_helpers(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.helper_orders
    ADD CONSTRAINT helper_orders_package_id_fkey FOREIGN KEY (package_id) REFERENCES public.coin_packages(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.helper_orders
    ADD CONSTRAINT helper_orders_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.helper_payment_methods
    ADD CONSTRAINT helper_payment_methods_helper_id_fkey FOREIGN KEY (helper_id) REFERENCES public.topup_helpers(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.helper_topup_requests
    ADD CONSTRAINT helper_topup_requests_helper_id_fkey FOREIGN KEY (helper_id) REFERENCES public.topup_helpers(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.helper_topup_requests
    ADD CONSTRAINT helper_topup_requests_processed_by_fkey FOREIGN KEY (processed_by) REFERENCES auth.users(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.helper_topup_requests
    ADD CONSTRAINT helper_topup_requests_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.helper_transactions
    ADD CONSTRAINT helper_transactions_helper_id_fkey FOREIGN KEY (helper_id) REFERENCES public.topup_helpers(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.helper_transactions
    ADD CONSTRAINT helper_transactions_processed_by_fkey FOREIGN KEY (processed_by) REFERENCES public.profiles(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.helper_transactions
    ADD CONSTRAINT helper_transactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.helper_upgrade_requests
    ADD CONSTRAINT helper_upgrade_requests_helper_id_fkey FOREIGN KEY (helper_id) REFERENCES public.topup_helpers(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.helper_upgrade_requests
    ADD CONSTRAINT helper_upgrade_requests_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES auth.users(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.helper_upgrade_requests
    ADD CONSTRAINT helper_upgrade_requests_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.helper_withdrawal_requests
    ADD CONSTRAINT helper_withdrawal_requests_agency_id_fkey FOREIGN KEY (agency_id) REFERENCES public.agencies(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.helper_withdrawal_requests
    ADD CONSTRAINT helper_withdrawal_requests_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES auth.users(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.helper_withdrawal_requests
    ADD CONSTRAINT helper_withdrawal_requests_helper_id_fkey FOREIGN KEY (helper_id) REFERENCES public.topup_helpers(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.helper_withdrawal_requests
    ADD CONSTRAINT helper_withdrawal_requests_host_id_fkey FOREIGN KEY (host_id) REFERENCES public.profiles(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.helper_withdrawal_requests
    ADD CONSTRAINT helper_withdrawal_requests_withdrawal_id_fkey FOREIGN KEY (withdrawal_id) REFERENCES public.agency_withdrawals(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.host_applications
    ADD CONSTRAINT host_applications_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES auth.users(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.host_applications
    ADD CONSTRAINT host_applications_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.host_contact_violations
    ADD CONSTRAINT host_contact_violations_host_id_fkey FOREIGN KEY (host_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.host_contact_violations
    ADD CONSTRAINT host_contact_violations_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES public.profiles(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.invitation_reward_claims
    ADD CONSTRAINT invitation_reward_claims_tier_id_fkey FOREIGN KEY (tier_id) REFERENCES public.invitation_settings(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.invitation_reward_claims
    ADD CONSTRAINT invitation_reward_claims_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.leaderboard_reward_history
    ADD CONSTRAINT leaderboard_reward_history_agency_id_fkey FOREIGN KEY (agency_id) REFERENCES public.agencies(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.leaderboard_reward_history
    ADD CONSTRAINT leaderboard_reward_history_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.limited_offer_claims
    ADD CONSTRAINT limited_offer_claims_offer_id_fkey FOREIGN KEY (offer_id) REFERENCES public.limited_time_offers(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.live_bans
    ADD CONSTRAINT live_bans_unbanned_by_fkey FOREIGN KEY (unbanned_by) REFERENCES auth.users(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.live_bans
    ADD CONSTRAINT live_bans_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.live_face_violations
    ADD CONSTRAINT live_face_violations_host_id_fkey FOREIGN KEY (host_id) REFERENCES public.profiles(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.live_game_bets
    ADD CONSTRAINT live_game_bets_round_id_fkey FOREIGN KEY (round_id) REFERENCES public.live_game_rounds(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.live_game_bets
    ADD CONSTRAINT live_game_bets_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.live_game_rounds
    ADD CONSTRAINT live_game_rounds_room_id_fkey FOREIGN KEY (room_id) REFERENCES public.party_rooms(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.live_moderation_settings
    ADD CONSTRAINT live_moderation_settings_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.live_streams
    ADD CONSTRAINT live_streams_host_id_fkey FOREIGN KEY (host_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.live_violations
    ADD CONSTRAINT live_violations_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.new_host_live_bonus_progress
    ADD CONSTRAINT new_host_live_bonus_progress_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.notification_templates
    ADD CONSTRAINT notification_templates_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.parcel_claims
    ADD CONSTRAINT parcel_claims_parcel_id_fkey FOREIGN KEY (parcel_id) REFERENCES public.user_parcels(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.parcel_claims
    ADD CONSTRAINT parcel_claims_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.party_room_messages
    ADD CONSTRAINT party_room_messages_room_id_fkey FOREIGN KEY (room_id) REFERENCES public.party_rooms(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.party_room_messages
    ADD CONSTRAINT party_room_messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.party_room_participants
    ADD CONSTRAINT party_room_participants_room_id_fkey FOREIGN KEY (room_id) REFERENCES public.party_rooms(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.party_room_participants
    ADD CONSTRAINT party_room_participants_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.party_rooms
    ADD CONSTRAINT party_rooms_background_id_fkey FOREIGN KEY (background_id) REFERENCES public.party_room_backgrounds(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.party_rooms
    ADD CONSTRAINT party_rooms_current_music_id_fkey FOREIGN KEY (current_music_id) REFERENCES public.admin_music_library(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.party_rooms
    ADD CONSTRAINT party_rooms_host_id_fkey FOREIGN KEY (host_id) REFERENCES public.profiles(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.payment_reconciliation_log
    ADD CONSTRAINT payment_reconciliation_log_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.payment_transactions
    ADD CONSTRAINT payment_transactions_gateway_id_fkey FOREIGN KEY (gateway_id) REFERENCES public.payment_gateways(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.payment_transactions
    ADD CONSTRAINT payment_transactions_package_id_fkey FOREIGN KEY (package_id) REFERENCES public.coin_packages(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.payment_transactions
    ADD CONSTRAINT payment_transactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.payroll_requests
    ADD CONSTRAINT payroll_requests_agency_id_fkey FOREIGN KEY (agency_id) REFERENCES public.agencies(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.payroll_requests
    ADD CONSTRAINT payroll_requests_trader_id_fkey FOREIGN KEY (trader_id) REFERENCES public.topup_helpers(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.pk_battle_gifts
    ADD CONSTRAINT pk_battle_gifts_battle_id_fkey FOREIGN KEY (battle_id) REFERENCES public.pk_battles(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.pk_battle_gifts
    ADD CONSTRAINT pk_battle_gifts_gift_id_fkey FOREIGN KEY (gift_id) REFERENCES public.gifts(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.pk_battle_gifts
    ADD CONSTRAINT pk_battle_gifts_receiver_id_fkey FOREIGN KEY (receiver_id) REFERENCES public.profiles(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.pk_battle_gifts
    ADD CONSTRAINT pk_battle_gifts_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES public.profiles(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.pk_battles
    ADD CONSTRAINT pk_battles_challenger_id_fkey FOREIGN KEY (challenger_id) REFERENCES public.profiles(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.pk_battles
    ADD CONSTRAINT pk_battles_challenger_stream_id_fkey FOREIGN KEY (challenger_stream_id) REFERENCES public.live_streams(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.pk_battles
    ADD CONSTRAINT pk_battles_opponent_id_fkey FOREIGN KEY (opponent_id) REFERENCES public.profiles(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.pk_battles
    ADD CONSTRAINT pk_battles_opponent_stream_id_fkey FOREIGN KEY (opponent_stream_id) REFERENCES public.live_streams(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.pk_battles
    ADD CONSTRAINT pk_battles_winner_id_fkey FOREIGN KEY (winner_id) REFERENCES public.profiles(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.pk_competition_rewards
    ADD CONSTRAINT pk_competition_rewards_competition_id_fkey FOREIGN KEY (competition_id) REFERENCES public.pk_competitions(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.pk_participants
    ADD CONSTRAINT pk_participants_competition_id_fkey FOREIGN KEY (competition_id) REFERENCES public.pk_competitions(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.pk_participants
    ADD CONSTRAINT pk_participants_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.pk_reward_history
    ADD CONSTRAINT pk_reward_history_competition_id_fkey FOREIGN KEY (competition_id) REFERENCES public.pk_competitions(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.pk_reward_history
    ADD CONSTRAINT pk_reward_history_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.poster_images
    ADD CONSTRAINT poster_images_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.private_call_security_logs
    ADD CONSTRAINT private_call_security_logs_call_id_fkey FOREIGN KEY (call_id) REFERENCES public.private_calls(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.private_call_security_logs
    ADD CONSTRAINT private_call_security_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.private_calls
    ADD CONSTRAINT private_calls_caller_id_fkey FOREIGN KEY (caller_id) REFERENCES public.profiles(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.private_calls
    ADD CONSTRAINT private_calls_host_earnings_credited_by_fkey FOREIGN KEY (host_earnings_credited_by) REFERENCES auth.users(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.private_calls
    ADD CONSTRAINT private_calls_host_id_fkey FOREIGN KEY (host_id) REFERENCES public.profiles(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.private_calls
    ADD CONSTRAINT private_calls_stream_id_fkey FOREIGN KEY (stream_id) REFERENCES public.live_streams(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_agency_id_fkey FOREIGN KEY (agency_id) REFERENCES public.agencies(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_current_vip_tier_id_fkey FOREIGN KEY (current_vip_tier_id) REFERENCES public.vip_tiers(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_frame_id_fkey FOREIGN KEY (frame_id) REFERENCES public.avatar_frames(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.provider_games
    ADD CONSTRAINT provider_games_provider_id_fkey FOREIGN KEY (provider_id) REFERENCES public.game_providers(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.rate_limits
    ADD CONSTRAINT rate_limits_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.rating_reward_claims
    ADD CONSTRAINT rating_reward_claims_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.recharge_transactions
    ADD CONSTRAINT recharge_transactions_agency_id_fkey FOREIGN KEY (agency_id) REFERENCES public.agencies(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.recharge_transactions
    ADD CONSTRAINT recharge_transactions_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES public.profiles(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.recharge_transactions
    ADD CONSTRAINT recharge_transactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.reel_comments
    ADD CONSTRAINT reel_comments_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.reel_comments(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.reel_comments
    ADD CONSTRAINT reel_comments_reel_id_fkey FOREIGN KEY (reel_id) REFERENCES public.reels(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.reel_comments
    ADD CONSTRAINT reel_comments_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.reel_likes
    ADD CONSTRAINT reel_likes_reel_id_fkey FOREIGN KEY (reel_id) REFERENCES public.reels(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.reel_likes
    ADD CONSTRAINT reel_likes_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.reel_reports
    ADD CONSTRAINT reel_reports_reel_id_fkey FOREIGN KEY (reel_id) REFERENCES public.reels(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.reel_reports
    ADD CONSTRAINT reel_reports_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES public.profiles(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.reel_reports
    ADD CONSTRAINT reel_reports_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.reel_shares
    ADD CONSTRAINT reel_shares_reel_id_fkey FOREIGN KEY (reel_id) REFERENCES public.reels(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.reel_shares
    ADD CONSTRAINT reel_shares_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.reels
    ADD CONSTRAINT reels_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.reel_categories(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.reels
    ADD CONSTRAINT reels_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.roulette_bets
    ADD CONSTRAINT roulette_bets_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.roulette_sessions(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.roulette_bets
    ADD CONSTRAINT roulette_bets_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.seat_invitations
    ADD CONSTRAINT seat_invitations_host_id_fkey FOREIGN KEY (host_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.seat_invitations
    ADD CONSTRAINT seat_invitations_invitee_id_fkey FOREIGN KEY (invitee_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.seat_invitations
    ADD CONSTRAINT seat_invitations_room_id_fkey FOREIGN KEY (room_id) REFERENCES public.party_rooms(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.seat_requests
    ADD CONSTRAINT seat_requests_requester_id_fkey FOREIGN KEY (requester_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.seat_requests
    ADD CONSTRAINT seat_requests_room_id_fkey FOREIGN KEY (room_id) REFERENCES public.party_rooms(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.security_alerts
    ADD CONSTRAINT security_alerts_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.stream_chat
    ADD CONSTRAINT stream_chat_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.stream_chat
    ADD CONSTRAINT stream_chat_stream_id_fkey FOREIGN KEY (stream_id) REFERENCES public.live_streams(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.stream_recordings
    ADD CONSTRAINT stream_recordings_host_id_fkey FOREIGN KEY (host_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.stream_recordings
    ADD CONSTRAINT stream_recordings_stream_id_fkey FOREIGN KEY (stream_id) REFERENCES public.live_streams(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.stream_viewers
    ADD CONSTRAINT stream_viewers_stream_id_fkey FOREIGN KEY (stream_id) REFERENCES public.live_streams(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.stream_viewers
    ADD CONSTRAINT stream_viewers_viewer_id_fkey FOREIGN KEY (viewer_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.sub_agent_commissions
    ADD CONSTRAINT sub_agent_commissions_gift_transaction_id_fkey FOREIGN KEY (gift_transaction_id) REFERENCES public.gift_transactions(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.sub_agent_commissions
    ADD CONSTRAINT sub_agent_commissions_host_id_fkey FOREIGN KEY (host_id) REFERENCES public.profiles(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.sub_agent_commissions
    ADD CONSTRAINT sub_agent_commissions_sub_agent_id_fkey FOREIGN KEY (sub_agent_id) REFERENCES public.sub_agents(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.sub_agent_referrals
    ADD CONSTRAINT sub_agent_referrals_referred_host_id_fkey FOREIGN KEY (referred_host_id) REFERENCES public.profiles(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.sub_agent_referrals
    ADD CONSTRAINT sub_agent_referrals_sub_agent_id_fkey FOREIGN KEY (sub_agent_id) REFERENCES public.sub_agents(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.sub_agents
    ADD CONSTRAINT sub_agents_agency_id_fkey FOREIGN KEY (agency_id) REFERENCES public.agencies(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.sub_agents
    ADD CONSTRAINT sub_agents_referrer_id_fkey FOREIGN KEY (referrer_id) REFERENCES public.profiles(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.sub_agents
    ADD CONSTRAINT sub_agents_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.subscription_orders
    ADD CONSTRAINT subscription_orders_payment_method_id_fkey FOREIGN KEY (payment_method_id) REFERENCES public.payment_methods(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.subscription_orders
    ADD CONSTRAINT subscription_orders_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.subscription_plans(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.support_messages
    ADD CONSTRAINT support_messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES auth.users(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.support_messages
    ADD CONSTRAINT support_messages_ticket_id_fkey FOREIGN KEY (ticket_id) REFERENCES public.support_tickets(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.support_tickets
    ADD CONSTRAINT support_tickets_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES auth.users(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.support_tickets
    ADD CONSTRAINT support_tickets_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.topup_helpers
    ADD CONSTRAINT topup_helpers_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES public.profiles(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.topup_helpers
    ADD CONSTRAINT topup_helpers_payroll_approved_by_fkey FOREIGN KEY (payroll_approved_by) REFERENCES auth.users(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.topup_helpers
    ADD CONSTRAINT topup_helpers_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.trader_level_purchases
    ADD CONSTRAINT trader_level_purchases_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES auth.users(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.trader_level_purchases
    ADD CONSTRAINT trader_level_purchases_trader_id_fkey FOREIGN KEY (trader_id) REFERENCES public.topup_helpers(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.user_beans_exchange_history
    ADD CONSTRAINT user_beans_exchange_history_tier_id_fkey FOREIGN KEY (tier_id) REFERENCES public.user_beans_exchange_tiers(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.user_beans_exchange_history
    ADD CONSTRAINT user_beans_exchange_history_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.user_blocks
    ADD CONSTRAINT user_blocks_blocked_id_fkey FOREIGN KEY (blocked_id) REFERENCES auth.users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.user_blocks
    ADD CONSTRAINT user_blocks_blocker_id_fkey FOREIGN KEY (blocker_id) REFERENCES auth.users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.user_entry_banners
    ADD CONSTRAINT user_entry_banners_entry_banner_id_fkey FOREIGN KEY (entry_banner_id) REFERENCES public.entry_banners(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.user_entry_banners
    ADD CONSTRAINT user_entry_banners_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.user_invitations
    ADD CONSTRAINT user_invitations_invited_user_id_fkey FOREIGN KEY (invited_user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.user_invitations
    ADD CONSTRAINT user_invitations_inviter_id_fkey FOREIGN KEY (inviter_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.user_parcels
    ADD CONSTRAINT user_parcels_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.parcel_templates(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.user_parcels
    ADD CONSTRAINT user_parcels_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.user_purchased_backgrounds
    ADD CONSTRAINT user_purchased_backgrounds_background_id_fkey FOREIGN KEY (background_id) REFERENCES public.party_room_backgrounds(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.user_purchased_backgrounds
    ADD CONSTRAINT user_purchased_backgrounds_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.user_purchases
    ADD CONSTRAINT user_purchases_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.shop_items(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.user_purchases
    ADD CONSTRAINT user_purchases_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.user_reports
    ADD CONSTRAINT user_reports_reported_user_id_fkey FOREIGN KEY (reported_user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.user_reports
    ADD CONSTRAINT user_reports_reporter_id_fkey FOREIGN KEY (reporter_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.user_reports
    ADD CONSTRAINT user_reports_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES public.profiles(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.user_role_frames
    ADD CONSTRAINT user_role_frames_assigned_by_fkey FOREIGN KEY (assigned_by) REFERENCES public.profiles(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.user_role_frames
    ADD CONSTRAINT user_role_frames_frame_id_fkey FOREIGN KEY (frame_id) REFERENCES public.role_frames(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.user_role_frames
    ADD CONSTRAINT user_role_frames_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.user_subscriptions
    ADD CONSTRAINT user_subscriptions_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.subscription_orders(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.user_subscriptions
    ADD CONSTRAINT user_subscriptions_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.subscription_plans(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.user_subscriptions
    ADD CONSTRAINT user_subscriptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.user_task_progress
    ADD CONSTRAINT user_task_progress_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.daily_tasks(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.user_task_progress
    ADD CONSTRAINT user_task_progress_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.user_vip_subscriptions
    ADD CONSTRAINT user_vip_subscriptions_tier_id_fkey FOREIGN KEY (tier_id) REFERENCES public.vip_tiers(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.user_vip_subscriptions
    ADD CONSTRAINT user_vip_subscriptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.vip_exclusive_items
    ADD CONSTRAINT vip_exclusive_items_vip_tier_id_fkey FOREIGN KEY (vip_tier_id) REFERENCES public.vip_tiers(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.vpn_detection_logs
    ADD CONSTRAINT vpn_detection_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.watchlist
    ADD CONSTRAINT watchlist_content_id_fkey FOREIGN KEY (content_id) REFERENCES public.site_content(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.watchlist
    ADD CONSTRAINT watchlist_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE ONLY public.welcome_bonuses
    ADD CONSTRAINT welcome_bonuses_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;