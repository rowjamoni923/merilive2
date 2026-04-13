DO $$
DECLARE
  keep_id UUID := '33fd2efe-ff62-489b-80f4-c497599dd893';
BEGIN

-- Transactions
DELETE FROM coin_transactions WHERE user_id IS DISTINCT FROM keep_id;
DELETE FROM coin_transfers WHERE sender_id != keep_id AND receiver_id != keep_id;
DELETE FROM gift_transactions WHERE sender_id != keep_id AND receiver_id != keep_id;
DELETE FROM gift_transaction_logs WHERE sender_id != keep_id AND receiver_id != keep_id;
DELETE FROM call_events WHERE caller_id != keep_id AND receiver_id != keep_id;
DELETE FROM payment_transactions WHERE user_id != keep_id;
DELETE FROM game_transactions WHERE user_id != keep_id;

-- User activity
DELETE FROM blocked_users WHERE blocker_id != keep_id AND blocked_id != keep_id;
DELETE FROM followers WHERE follower_id != keep_id AND following_id != keep_id;
DELETE FROM daily_login_claims WHERE user_id != keep_id;
TRUNCATE daily_tasks;
DELETE FROM notifications WHERE user_id != keep_id;
DELETE FROM device_tokens WHERE user_id != keep_id;
DELETE FROM banned_devices WHERE user_id != keep_id;
TRUNCATE login_attempts;
TRUNCATE failed_login_attempts;
DELETE FROM face_verification_submissions WHERE user_id != keep_id;
DELETE FROM consumption_return_history WHERE user_id != keep_id;
DELETE FROM invitation_reward_claims WHERE claimed_by != keep_id;
DELETE FROM limited_offer_claims WHERE user_id != keep_id;
DELETE FROM first_recharge_claims WHERE user_id != keep_id;
DELETE FROM lucky_gift_results WHERE user_id != keep_id;
DELETE FROM parcel_claims WHERE user_id != keep_id;
DELETE FROM leaderboard_reward_history WHERE user_id != keep_id;
TRUNCATE subscription_orders;
DELETE FROM payroll_requests WHERE user_id != keep_id;

-- Chat
DELETE FROM messages WHERE conversation_id IN (
  SELECT id FROM conversations WHERE participant1_id != keep_id AND participant2_id != keep_id
);
DELETE FROM conversation_encryption_keys WHERE conversation_id IN (
  SELECT id FROM conversations WHERE participant1_id != keep_id AND participant2_id != keep_id
);
DELETE FROM conversations WHERE participant1_id != keep_id AND participant2_id != keep_id;

-- Groups
DELETE FROM group_messages WHERE group_id IN (SELECT id FROM groups WHERE created_by != keep_id);
DELETE FROM group_members WHERE user_id != keep_id;
DELETE FROM groups WHERE created_by != keep_id;

-- Live streams
DELETE FROM live_violations WHERE stream_id IN (SELECT id FROM live_streams WHERE host_id != keep_id);
DELETE FROM live_face_violations WHERE stream_id IN (SELECT id FROM live_streams WHERE host_id != keep_id);
DELETE FROM live_streams WHERE host_id != keep_id;
DELETE FROM live_bans WHERE user_id != keep_id;

-- Party rooms (party_rooms uses host_id, not created_by)
DELETE FROM party_room_messages WHERE room_id IN (SELECT id FROM party_rooms WHERE host_id != keep_id);
DELETE FROM party_room_participants WHERE room_id IN (SELECT id FROM party_rooms WHERE host_id != keep_id);
DELETE FROM live_game_bets WHERE round_id IN (
  SELECT id FROM live_game_rounds WHERE room_id IN (SELECT id FROM party_rooms WHERE host_id != keep_id)
);
DELETE FROM live_game_rounds WHERE room_id IN (SELECT id FROM party_rooms WHERE host_id != keep_id);
DELETE FROM party_rooms WHERE host_id != keep_id;

-- Reels
DELETE FROM reel_likes WHERE user_id != keep_id;
DELETE FROM reel_comments WHERE user_id != keep_id;
DELETE FROM reels WHERE user_id != keep_id;

-- Host
DELETE FROM host_applications WHERE user_id != keep_id;
DELETE FROM host_contact_violations WHERE user_id != keep_id;
DELETE FROM host_conversion_requests WHERE host_id != keep_id;
DELETE FROM new_host_live_bonus_progress WHERE host_id != keep_id;

-- Agency
DELETE FROM agency_earnings_transfers WHERE host_id != keep_id;
DELETE FROM agency_commission_history WHERE agency_id NOT IN (SELECT id FROM agencies WHERE owner_id = keep_id);
DELETE FROM agency_diamond_transactions WHERE agency_id NOT IN (SELECT id FROM agencies WHERE owner_id = keep_id);
DELETE FROM agency_performance WHERE agency_id NOT IN (SELECT id FROM agencies WHERE owner_id = keep_id);
DELETE FROM agency_rankings WHERE agency_id NOT IN (SELECT id FROM agencies WHERE owner_id = keep_id);
DELETE FROM agency_withdrawals WHERE agency_id NOT IN (SELECT id FROM agencies WHERE owner_id = keep_id);
DELETE FROM agency_hosts WHERE host_id != keep_id;
DELETE FROM agencies WHERE owner_id != keep_id;

-- Helper/Topup
DELETE FROM helper_orders WHERE helper_id NOT IN (SELECT id FROM topup_helpers WHERE user_id = keep_id);
DELETE FROM helper_transactions WHERE helper_id NOT IN (SELECT id FROM topup_helpers WHERE user_id = keep_id);
DELETE FROM helper_topup_requests WHERE helper_id NOT IN (SELECT id FROM topup_helpers WHERE user_id = keep_id);
DELETE FROM helper_withdrawal_requests WHERE helper_id NOT IN (SELECT id FROM topup_helpers WHERE user_id = keep_id);
DELETE FROM helper_notifications WHERE helper_id NOT IN (SELECT id FROM topup_helpers WHERE user_id = keep_id);
DELETE FROM topup_helpers WHERE user_id != keep_id;

-- Games
DELETE FROM game_bets WHERE player_id != keep_id;
DELETE FROM game_players WHERE user_id != keep_id;
DELETE FROM game_session_tokens WHERE user_id != keep_id;
DELETE FROM game_sessions WHERE created_by != keep_id;
DELETE FROM game_stats WHERE user_id != keep_id;

-- Reports & moderation
DELETE FROM chat_moderation_logs WHERE user_id != keep_id;

-- Cleanup
DELETE FROM account_lockouts;
DELETE FROM email_otps;
DELETE FROM admin_login_otps;
DELETE FROM password_reset_otps;

-- Finally delete profiles
DELETE FROM profiles WHERE id != keep_id;

END $$;
