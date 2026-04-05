-- FK Batch 1: 79 constraints

DO $$ BEGIN
  ALTER TABLE ONLY public.admin_allowed_devices ADD CONSTRAINT admin_allowed_devices_admin_user_id_fkey FOREIGN KEY (admin_user_id) REFERENCES public.admin_users(id) ON DELETE CASCADE;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.admin_allowed_devices ADD CONSTRAINT admin_allowed_devices_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES public.admin_users(id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.admin_section_permissions ADD CONSTRAINT admin_section_permissions_admin_user_id_fkey FOREIGN KEY (admin_user_id) REFERENCES public.admin_users(id) ON DELETE CASCADE;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.admin_section_permissions ADD CONSTRAINT admin_section_permissions_section_id_fkey FOREIGN KEY (section_id) REFERENCES public.admin_sections(id) ON DELETE CASCADE;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.agencies ADD CONSTRAINT agencies_parent_agency_id_fkey FOREIGN KEY (parent_agency_id) REFERENCES public.agencies(id) ON DELETE SET NULL;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.agency_commission_history ADD CONSTRAINT agency_commission_history_agency_id_fkey FOREIGN KEY (agency_id) REFERENCES public.agencies(id) ON DELETE CASCADE;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.agency_commission_history ADD CONSTRAINT agency_commission_history_host_id_fkey FOREIGN KEY (host_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.agency_diamond_transactions ADD CONSTRAINT agency_diamond_transactions_agency_id_fkey FOREIGN KEY (agency_id) REFERENCES public.agencies(id) ON DELETE CASCADE;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.agency_diamond_transactions ADD CONSTRAINT agency_diamond_transactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.agency_earnings_transfers ADD CONSTRAINT agency_earnings_transfers_agency_id_fkey FOREIGN KEY (agency_id) REFERENCES public.agencies(id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.agency_earnings_transfers ADD CONSTRAINT agency_earnings_transfers_host_id_fkey FOREIGN KEY (host_id) REFERENCES public.profiles(id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.agency_hosts ADD CONSTRAINT agency_hosts_agency_id_fkey FOREIGN KEY (agency_id) REFERENCES public.agencies(id) ON DELETE CASCADE;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.agency_hosts ADD CONSTRAINT agency_hosts_host_id_fkey FOREIGN KEY (host_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.agency_performance ADD CONSTRAINT agency_performance_agency_id_fkey FOREIGN KEY (agency_id) REFERENCES public.agencies(id) ON DELETE CASCADE;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.agency_rankings ADD CONSTRAINT agency_rankings_agency_id_fkey FOREIGN KEY (agency_id) REFERENCES public.agencies(id) ON DELETE CASCADE;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.agency_withdrawals ADD CONSTRAINT agency_withdrawals_agency_id_fkey FOREIGN KEY (agency_id) REFERENCES public.agencies(id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.agency_withdrawals ADD CONSTRAINT agency_withdrawals_assigned_helper_id_fkey FOREIGN KEY (assigned_helper_id) REFERENCES public.topup_helpers(id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.banned_devices ADD CONSTRAINT banned_devices_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.call_events ADD CONSTRAINT call_events_call_id_fkey FOREIGN KEY (call_id) REFERENCES public.private_calls(id) ON DELETE CASCADE;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.chat_moderation_logs ADD CONSTRAINT chat_moderation_logs_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES public.profiles(id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.chat_moderation_logs ADD CONSTRAINT chat_moderation_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.content_audio_tracks ADD CONSTRAINT content_audio_tracks_content_id_fkey FOREIGN KEY (content_id) REFERENCES public.site_content(id) ON DELETE CASCADE;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.content_subtitles ADD CONSTRAINT content_subtitles_content_id_fkey FOREIGN KEY (content_id) REFERENCES public.site_content(id) ON DELETE CASCADE;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.conversations ADD CONSTRAINT conversations_participant_1_fkey FOREIGN KEY (participant1_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.conversations ADD CONSTRAINT conversations_participant_2_fkey FOREIGN KEY (participant2_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.face_records ADD CONSTRAINT face_records_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.face_verification_submissions ADD CONSTRAINT face_verification_submissions_duplicate_face_user_id_fkey FOREIGN KEY (duplicate_face_user_id) REFERENCES public.profiles(id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.face_verification_submissions ADD CONSTRAINT face_verification_submissions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.followers ADD CONSTRAINT followers_follower_id_fkey FOREIGN KEY (follower_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.followers ADD CONSTRAINT followers_following_id_fkey FOREIGN KEY (following_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.game_bets ADD CONSTRAINT game_bets_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.game_sessions(id) ON DELETE SET NULL;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.game_bets ADD CONSTRAINT game_bets_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.game_players ADD CONSTRAINT game_players_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.game_sessions(id) ON DELETE CASCADE;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.game_players ADD CONSTRAINT game_players_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.game_provider_logs ADD CONSTRAINT game_provider_logs_provider_id_fkey FOREIGN KEY (provider_id) REFERENCES public.game_providers(id) ON DELETE SET NULL;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.game_sessions ADD CONSTRAINT game_sessions_room_id_fkey FOREIGN KEY (room_id) REFERENCES public.party_rooms(id) ON DELETE CASCADE;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.game_sessions ADD CONSTRAINT game_sessions_winner_id_fkey FOREIGN KEY (winner_id) REFERENCES public.profiles(id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.game_transactions ADD CONSTRAINT game_transactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.gift_transaction_logs ADD CONSTRAINT gift_transaction_logs_credited_by_fkey FOREIGN KEY (credited_by) REFERENCES public.profiles(id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.gift_transaction_logs ADD CONSTRAINT gift_transaction_logs_gift_id_fkey FOREIGN KEY (gift_id) REFERENCES public.gifts(id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.gift_transaction_logs ADD CONSTRAINT gift_transaction_logs_receiver_id_fkey FOREIGN KEY (receiver_id) REFERENCES public.profiles(id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.gift_transaction_logs ADD CONSTRAINT gift_transaction_logs_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES public.profiles(id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.gift_transaction_logs ADD CONSTRAINT gift_transaction_logs_transaction_id_fkey FOREIGN KEY (transaction_id) REFERENCES public.gift_transactions(id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.gift_transactions ADD CONSTRAINT gift_transactions_gift_id_fkey FOREIGN KEY (gift_id) REFERENCES public.gifts(id) ON DELETE CASCADE;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.gift_transactions ADD CONSTRAINT gift_transactions_party_room_id_fkey FOREIGN KEY (party_room_id) REFERENCES public.party_rooms(id) ON DELETE SET NULL;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.gift_transactions ADD CONSTRAINT gift_transactions_receiver_id_fkey FOREIGN KEY (receiver_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.gift_transactions ADD CONSTRAINT gift_transactions_reel_id_fkey FOREIGN KEY (reel_id) REFERENCES public.reels(id) ON DELETE SET NULL;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.gift_transactions ADD CONSTRAINT gift_transactions_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.gift_transactions ADD CONSTRAINT gift_transactions_stream_id_fkey FOREIGN KEY (stream_id) REFERENCES public.live_streams(id) ON DELETE SET NULL;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.host_applications ADD CONSTRAINT host_applications_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES public.profiles(id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.host_applications ADD CONSTRAINT host_applications_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.host_availability_schedule ADD CONSTRAINT host_availability_schedule_host_id_fkey FOREIGN KEY (host_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.host_daily_targets ADD CONSTRAINT host_daily_targets_host_id_fkey FOREIGN KEY (host_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.host_fraud_logs ADD CONSTRAINT host_fraud_logs_host_id_fkey FOREIGN KEY (host_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.host_live_time_logs ADD CONSTRAINT host_live_time_logs_host_id_fkey FOREIGN KEY (host_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.host_live_time_logs ADD CONSTRAINT host_live_time_logs_stream_id_fkey FOREIGN KEY (stream_id) REFERENCES public.live_streams(id) ON DELETE SET NULL;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.host_performance ADD CONSTRAINT host_performance_host_id_fkey FOREIGN KEY (host_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.host_salary_calculations ADD CONSTRAINT host_salary_calculations_agency_id_fkey FOREIGN KEY (agency_id) REFERENCES public.agencies(id) ON DELETE CASCADE;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.host_salary_calculations ADD CONSTRAINT host_salary_calculations_host_id_fkey FOREIGN KEY (host_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.host_weekly_earnings ADD CONSTRAINT host_weekly_earnings_agency_id_fkey FOREIGN KEY (agency_id) REFERENCES public.agencies(id) ON DELETE SET NULL;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.host_weekly_earnings ADD CONSTRAINT host_weekly_earnings_host_id_fkey FOREIGN KEY (host_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.invitation_rewards ADD CONSTRAINT invitation_rewards_invitation_id_fkey FOREIGN KEY (invitation_id) REFERENCES public.user_invitations(id) ON DELETE CASCADE;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.invitation_rewards ADD CONSTRAINT invitation_rewards_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.ip_logs ADD CONSTRAINT ip_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.level_privileges ADD CONSTRAINT level_privileges_frame_id_fkey FOREIGN KEY (frame_id) REFERENCES public.avatar_frames(id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.level_up_history ADD CONSTRAINT level_up_history_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.limited_offer_claims ADD CONSTRAINT limited_offer_claims_offer_id_fkey FOREIGN KEY (offer_id) REFERENCES public.limited_time_offers(id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;