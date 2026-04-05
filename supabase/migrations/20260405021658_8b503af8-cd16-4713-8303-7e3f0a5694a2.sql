-- FK Batch 2: 79 constraints

DO $$ BEGIN
  ALTER TABLE ONLY public.limited_offer_claims ADD CONSTRAINT limited_offer_claims_offer_id_fkey FOREIGN KEY (offer_id) REFERENCES public.limited_time_offers(id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.live_face_violations ADD CONSTRAINT live_face_violations_host_id_fkey FOREIGN KEY (host_id) REFERENCES public.profiles(id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.live_game_bets ADD CONSTRAINT live_game_bets_round_id_fkey FOREIGN KEY (round_id) REFERENCES public.live_game_rounds(id) ON DELETE CASCADE;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.live_game_bets ADD CONSTRAINT live_game_bets_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.live_game_rounds ADD CONSTRAINT live_game_rounds_room_id_fkey FOREIGN KEY (room_id) REFERENCES public.party_rooms(id) ON DELETE SET NULL;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.live_streams ADD CONSTRAINT live_streams_host_id_fkey FOREIGN KEY (host_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.messages ADD CONSTRAINT messages_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE CASCADE;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.messages ADD CONSTRAINT messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.new_host_live_bonus_progress ADD CONSTRAINT new_host_live_bonus_progress_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.notifications ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.parcel_claims ADD CONSTRAINT parcel_claims_parcel_id_fkey FOREIGN KEY (parcel_id) REFERENCES public.user_parcels(id) ON DELETE CASCADE;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.party_room_messages ADD CONSTRAINT party_room_messages_room_id_fkey FOREIGN KEY (room_id) REFERENCES public.party_rooms(id) ON DELETE CASCADE;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.party_room_messages ADD CONSTRAINT party_room_messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.party_room_participants ADD CONSTRAINT party_room_participants_room_id_fkey FOREIGN KEY (room_id) REFERENCES public.party_rooms(id) ON DELETE CASCADE;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.party_room_participants ADD CONSTRAINT party_room_participants_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.party_rooms ADD CONSTRAINT party_rooms_background_id_fkey FOREIGN KEY (background_id) REFERENCES public.party_room_backgrounds(id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.party_rooms ADD CONSTRAINT party_rooms_current_music_id_fkey FOREIGN KEY (current_music_id) REFERENCES public.admin_music_library(id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.party_rooms ADD CONSTRAINT party_rooms_host_id_fkey FOREIGN KEY (host_id) REFERENCES public.profiles(id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.payment_transactions ADD CONSTRAINT payment_transactions_gateway_id_fkey FOREIGN KEY (gateway_id) REFERENCES public.payment_gateways(id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.payment_transactions ADD CONSTRAINT payment_transactions_package_id_fkey FOREIGN KEY (package_id) REFERENCES public.coin_packages(id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.payment_transactions ADD CONSTRAINT payment_transactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.payroll_requests ADD CONSTRAINT payroll_requests_agency_id_fkey FOREIGN KEY (agency_id) REFERENCES public.agencies(id) ON DELETE CASCADE;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.payroll_requests ADD CONSTRAINT payroll_requests_trader_id_fkey FOREIGN KEY (trader_id) REFERENCES public.topup_helpers(id) ON DELETE SET NULL;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.pk_battle_gifts ADD CONSTRAINT pk_battle_gifts_battle_id_fkey FOREIGN KEY (battle_id) REFERENCES public.pk_battles(id) ON DELETE CASCADE;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.pk_battle_gifts ADD CONSTRAINT pk_battle_gifts_gift_id_fkey FOREIGN KEY (gift_id) REFERENCES public.gifts(id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.pk_battle_gifts ADD CONSTRAINT pk_battle_gifts_receiver_id_fkey FOREIGN KEY (receiver_id) REFERENCES public.profiles(id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.pk_battle_gifts ADD CONSTRAINT pk_battle_gifts_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES public.profiles(id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.pk_battles ADD CONSTRAINT pk_battles_challenger_id_fkey FOREIGN KEY (challenger_id) REFERENCES public.profiles(id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.pk_battles ADD CONSTRAINT pk_battles_challenger_stream_id_fkey FOREIGN KEY (challenger_stream_id) REFERENCES public.live_streams(id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.pk_battles ADD CONSTRAINT pk_battles_opponent_id_fkey FOREIGN KEY (opponent_id) REFERENCES public.profiles(id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.pk_battles ADD CONSTRAINT pk_battles_opponent_stream_id_fkey FOREIGN KEY (opponent_stream_id) REFERENCES public.live_streams(id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.pk_battles ADD CONSTRAINT pk_battles_winner_id_fkey FOREIGN KEY (winner_id) REFERENCES public.profiles(id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.pk_competition_rewards ADD CONSTRAINT pk_competition_rewards_competition_id_fkey FOREIGN KEY (competition_id) REFERENCES public.pk_competitions(id) ON DELETE CASCADE;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.pk_participants ADD CONSTRAINT pk_participants_competition_id_fkey FOREIGN KEY (competition_id) REFERENCES public.pk_competitions(id) ON DELETE CASCADE;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.pk_participants ADD CONSTRAINT pk_participants_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.pk_reward_history ADD CONSTRAINT pk_reward_history_competition_id_fkey FOREIGN KEY (competition_id) REFERENCES public.pk_competitions(id) ON DELETE CASCADE;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.pk_reward_history ADD CONSTRAINT pk_reward_history_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.poster_images ADD CONSTRAINT poster_images_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.private_call_security_logs ADD CONSTRAINT private_call_security_logs_call_id_fkey FOREIGN KEY (call_id) REFERENCES public.private_calls(id) ON DELETE CASCADE;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.private_call_security_logs ADD CONSTRAINT private_call_security_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.private_calls ADD CONSTRAINT private_calls_caller_id_fkey FOREIGN KEY (caller_id) REFERENCES public.profiles(id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.private_calls ADD CONSTRAINT private_calls_host_id_fkey FOREIGN KEY (host_id) REFERENCES public.profiles(id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.private_calls ADD CONSTRAINT private_calls_stream_id_fkey FOREIGN KEY (stream_id) REFERENCES public.live_streams(id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.profiles ADD CONSTRAINT profiles_agency_id_fkey FOREIGN KEY (agency_id) REFERENCES public.agencies(id) ON DELETE SET NULL;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.profiles ADD CONSTRAINT profiles_current_vip_tier_id_fkey FOREIGN KEY (current_vip_tier_id) REFERENCES public.vip_tiers(id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.profiles ADD CONSTRAINT profiles_frame_id_fkey FOREIGN KEY (frame_id) REFERENCES public.avatar_frames(id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.provider_games ADD CONSTRAINT provider_games_provider_id_fkey FOREIGN KEY (provider_id) REFERENCES public.game_providers(id) ON DELETE CASCADE;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.rating_rewards ADD CONSTRAINT rating_rewards_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.recharge_history ADD CONSTRAINT recharge_history_package_id_fkey FOREIGN KEY (package_id) REFERENCES public.coin_packages(id) ON DELETE SET NULL;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.recharge_history ADD CONSTRAINT recharge_history_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.reel_comments ADD CONSTRAINT reel_comments_reel_id_fkey FOREIGN KEY (reel_id) REFERENCES public.reels(id) ON DELETE CASCADE;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.reel_comments ADD CONSTRAINT reel_comments_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.reel_likes ADD CONSTRAINT reel_likes_reel_id_fkey FOREIGN KEY (reel_id) REFERENCES public.reels(id) ON DELETE CASCADE;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.reel_likes ADD CONSTRAINT reel_likes_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.reels ADD CONSTRAINT reels_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.room_treasures ADD CONSTRAINT room_treasures_room_id_fkey FOREIGN KEY (room_id) REFERENCES public.party_rooms(id) ON DELETE CASCADE;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.salary_tier_configs ADD CONSTRAINT salary_tier_configs_tier_id_fkey FOREIGN KEY (tier_id) REFERENCES public.host_salary_tiers(id) ON DELETE CASCADE;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.special_gifts ADD CONSTRAINT special_gifts_gift_id_fkey FOREIGN KEY (gift_id) REFERENCES public.gifts(id) ON DELETE CASCADE;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.stream_chat_messages ADD CONSTRAINT stream_chat_messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.stream_chat_messages ADD CONSTRAINT stream_chat_messages_stream_id_fkey FOREIGN KEY (stream_id) REFERENCES public.live_streams(id) ON DELETE CASCADE;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.stream_gifts ADD CONSTRAINT stream_gifts_gift_id_fkey FOREIGN KEY (gift_id) REFERENCES public.gifts(id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.stream_gifts ADD CONSTRAINT stream_gifts_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES public.profiles(id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.stream_gifts ADD CONSTRAINT stream_gifts_stream_id_fkey FOREIGN KEY (stream_id) REFERENCES public.live_streams(id) ON DELETE CASCADE;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.stream_recordings ADD CONSTRAINT stream_recordings_stream_id_fkey FOREIGN KEY (stream_id) REFERENCES public.live_streams(id) ON DELETE CASCADE;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.stream_viewers ADD CONSTRAINT stream_viewers_stream_id_fkey FOREIGN KEY (stream_id) REFERENCES public.live_streams(id) ON DELETE CASCADE;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.stream_viewers ADD CONSTRAINT stream_viewers_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.sub_agent_commissions ADD CONSTRAINT sub_agent_commissions_host_id_fkey FOREIGN KEY (host_id) REFERENCES public.profiles(id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.sub_agent_commissions ADD CONSTRAINT sub_agent_commissions_sub_agent_id_fkey FOREIGN KEY (sub_agent_id) REFERENCES public.sub_agents(id) ON DELETE CASCADE;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;