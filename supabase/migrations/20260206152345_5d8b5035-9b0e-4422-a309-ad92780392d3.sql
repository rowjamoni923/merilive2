DO $$
DECLARE
  user_ids uuid[] := ARRAY[
    '1f762d90-4d8e-4bfc-9915-38f60d83d63b',
    'c02c5d52-1d10-4259-a31d-0eae1c31f49c',
    'd2d641a0-89b4-4b3d-956f-9e8f39c2495b',
    '9898e470-cf5b-46b2-8466-69474587cb04',
    '06ff30f4-6990-4090-beee-1681a654c55d',
    '7f81ef68-63b5-401f-a933-7695333096ae',
    'aacc1a92-3776-4136-bbd0-28bc7d1139c3',
    '51259e19-454b-43aa-915e-01333ef333a4',
    '303f6684-e8c1-43e1-b090-fc30ba15bdd9',
    'c9436713-a549-4493-abf7-ec0a53209f1b'
  ];
BEGIN
  DELETE FROM agency_commission_history WHERE host_id = ANY(user_ids);
  DELETE FROM agency_diamond_transactions WHERE user_id = ANY(user_ids);
  DELETE FROM agency_earnings_transfers WHERE host_id = ANY(user_ids);
  DELETE FROM agency_hosts WHERE host_id = ANY(user_ids);
  DELETE FROM chat_moderation_logs WHERE user_id = ANY(user_ids) OR reviewed_by = ANY(user_ids);
  DELETE FROM messages WHERE conversation_id IN (SELECT id FROM conversations WHERE participant_1 = ANY(user_ids) OR participant_2 = ANY(user_ids));
  DELETE FROM messages WHERE sender_id = ANY(user_ids);
  DELETE FROM conversations WHERE participant_1 = ANY(user_ids) OR participant_2 = ANY(user_ids);
  DELETE FROM face_records WHERE user_id = ANY(user_ids);
  DELETE FROM face_verification_submissions WHERE user_id = ANY(user_ids);
  DELETE FROM followers WHERE follower_id = ANY(user_ids) OR following_id = ANY(user_ids);
  DELETE FROM game_bets WHERE user_id = ANY(user_ids);
  DELETE FROM game_players WHERE user_id = ANY(user_ids);
  UPDATE game_sessions SET winner_id = NULL WHERE winner_id = ANY(user_ids);
  DELETE FROM game_transactions WHERE user_id = ANY(user_ids);
  DELETE FROM live_game_bets WHERE user_id = ANY(user_ids);
  DELETE FROM gift_transaction_logs WHERE sender_id = ANY(user_ids) OR receiver_id = ANY(user_ids) OR credited_by = ANY(user_ids);
  DELETE FROM gift_transactions WHERE sender_id = ANY(user_ids) OR receiver_id = ANY(user_ids);
  DELETE FROM group_messages WHERE sender_id = ANY(user_ids);
  DELETE FROM group_members WHERE user_id = ANY(user_ids);
  DELETE FROM groups WHERE owner_id = ANY(user_ids);
  DELETE FROM helper_applications WHERE user_id = ANY(user_ids);
  DELETE FROM helper_orders WHERE user_id = ANY(user_ids);
  DELETE FROM helper_transactions WHERE user_id = ANY(user_ids) OR processed_by = ANY(user_ids);
  DELETE FROM helper_withdrawal_requests WHERE host_id = ANY(user_ids);
  DELETE FROM host_applications WHERE user_id = ANY(user_ids);
  DELETE FROM leaderboard_reward_history WHERE user_id = ANY(user_ids);
  DELETE FROM call_events WHERE call_id IN (SELECT id FROM private_calls WHERE caller_id = ANY(user_ids) OR host_id = ANY(user_ids));
  DELETE FROM call_events WHERE call_id IN (SELECT id FROM private_calls WHERE stream_id IN (SELECT id FROM live_streams WHERE host_id = ANY(user_ids)));
  DELETE FROM private_calls WHERE caller_id = ANY(user_ids) OR host_id = ANY(user_ids);
  DELETE FROM private_calls WHERE stream_id IN (SELECT id FROM live_streams WHERE host_id = ANY(user_ids));
  DELETE FROM live_streams WHERE host_id = ANY(user_ids);
  DELETE FROM notifications WHERE user_id = ANY(user_ids);
  DELETE FROM party_room_messages WHERE sender_id = ANY(user_ids);
  DELETE FROM party_room_messages WHERE room_id IN (SELECT id FROM party_rooms WHERE host_id = ANY(user_ids));
  DELETE FROM party_room_participants WHERE user_id = ANY(user_ids);
  DELETE FROM party_room_participants WHERE room_id IN (SELECT id FROM party_rooms WHERE host_id = ANY(user_ids));
  DELETE FROM party_rooms WHERE host_id = ANY(user_ids);
  DELETE FROM payment_transactions WHERE user_id = ANY(user_ids);
  DELETE FROM pk_battle_gifts WHERE sender_id = ANY(user_ids) OR receiver_id = ANY(user_ids);
  DELETE FROM pk_battles WHERE challenger_id = ANY(user_ids);
  DELETE FROM pk_participants WHERE user_id = ANY(user_ids);
  DELETE FROM coin_transfers WHERE sender_id::text = ANY(ARRAY['1f762d90-4d8e-4bfc-9915-38f60d83d63b','c02c5d52-1d10-4259-a31d-0eae1c31f49c','d2d641a0-89b4-4b3d-956f-9e8f39c2495b','9898e470-cf5b-46b2-8466-69474587cb04','06ff30f4-6990-4090-beee-1681a654c55d','7f81ef68-63b5-401f-a933-7695333096ae','aacc1a92-3776-4136-bbd0-28bc7d1139c3','51259e19-454b-43aa-915e-01333ef333a4','303f6684-e8c1-43e1-b090-fc30ba15bdd9','c9436713-a549-4493-abf7-ec0a53209f1b']) OR receiver_id::text = ANY(ARRAY['1f762d90-4d8e-4bfc-9915-38f60d83d63b','c02c5d52-1d10-4259-a31d-0eae1c31f49c','d2d641a0-89b4-4b3d-956f-9e8f39c2495b','9898e470-cf5b-46b2-8466-69474587cb04','06ff30f4-6990-4090-beee-1681a654c55d','7f81ef68-63b5-401f-a933-7695333096ae','aacc1a92-3776-4136-bbd0-28bc7d1139c3','51259e19-454b-43aa-915e-01333ef333a4','303f6684-e8c1-43e1-b090-fc30ba15bdd9','c9436713-a549-4493-abf7-ec0a53209f1b']);
  DELETE FROM device_tokens WHERE user_id::text = ANY(ARRAY['1f762d90-4d8e-4bfc-9915-38f60d83d63b','c02c5d52-1d10-4259-a31d-0eae1c31f49c','d2d641a0-89b4-4b3d-956f-9e8f39c2495b','9898e470-cf5b-46b2-8466-69474587cb04','06ff30f4-6990-4090-beee-1681a654c55d','7f81ef68-63b5-401f-a933-7695333096ae','aacc1a92-3776-4136-bbd0-28bc7d1139c3','51259e19-454b-43aa-915e-01333ef333a4','303f6684-e8c1-43e1-b090-fc30ba15bdd9','c9436713-a549-4493-abf7-ec0a53209f1b']);
  DELETE FROM profiles WHERE id = ANY(user_ids);
END $$;