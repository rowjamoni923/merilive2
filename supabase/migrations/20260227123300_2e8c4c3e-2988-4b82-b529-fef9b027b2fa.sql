
-- =============================================
-- COMPREHENSIVE SCALABILITY & ERROR FIX MIGRATION
-- Fixes: device_tokens RLS, date=text error, missing indexes
-- =============================================

-- 1. FIX device_tokens RLS: Allow anonymous upsert (anon users registering push tokens)
DROP POLICY IF EXISTS "Anyone can register device token" ON public.device_tokens;
DROP POLICY IF EXISTS "Users can update own or anonymous tokens" ON public.device_tokens;

-- Allow both anon and authenticated to INSERT
CREATE POLICY "Anyone can register device token"
ON public.device_tokens FOR INSERT
WITH CHECK (true);

-- Allow update: anon can update anonymous tokens, authenticated can update their own
CREATE POLICY "Users can update own or anonymous tokens"
ON public.device_tokens FOR UPDATE
USING (user_id IS NULL OR auth.uid() = user_id)
WITH CHECK (true);

-- 2. PERFORMANCE INDEXES for high-traffic queries
-- These indexes prevent full table scans when millions of users are active

-- profiles: dashboard counts + online users + host listing
CREATE INDEX IF NOT EXISTS idx_profiles_is_online ON public.profiles (is_online) WHERE is_online = true;
CREATE INDEX IF NOT EXISTS idx_profiles_is_host ON public.profiles (is_host) WHERE is_host = true;
CREATE INDEX IF NOT EXISTS idx_profiles_is_blocked ON public.profiles (is_blocked) WHERE is_blocked = true;
CREATE INDEX IF NOT EXISTS idx_profiles_created_at ON public.profiles (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_profiles_app_uid ON public.profiles (app_uid);

-- gift_transactions: daily aggregation queries
CREATE INDEX IF NOT EXISTS idx_gift_transactions_created_at ON public.gift_transactions (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_gift_transactions_sender ON public.gift_transactions (sender_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_gift_transactions_receiver ON public.gift_transactions (receiver_id, created_at DESC);

-- private_calls: daily count
CREATE INDEX IF NOT EXISTS idx_private_calls_created_at ON public.private_calls (created_at DESC);

-- recharge_transactions: daily count  
CREATE INDEX IF NOT EXISTS idx_recharge_transactions_created_at ON public.recharge_transactions (created_at DESC);

-- daily_login_claims: daily count by date
CREATE INDEX IF NOT EXISTS idx_daily_login_claims_date ON public.daily_login_claims (claimed_date);

-- live_streams: active streams query
CREATE INDEX IF NOT EXISTS idx_live_streams_active ON public.live_streams (is_active) WHERE is_active = true AND ended_at IS NULL;

-- party_rooms: active rooms query
CREATE INDEX IF NOT EXISTS idx_party_rooms_active ON public.party_rooms (is_active) WHERE is_active = true;

-- agencies: active/blocked counts
CREATE INDEX IF NOT EXISTS idx_agencies_is_active ON public.agencies (is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_agencies_is_blocked ON public.agencies (is_blocked) WHERE is_blocked = true;
CREATE INDEX IF NOT EXISTS idx_agencies_owner ON public.agencies (owner_id);

-- host_applications: pending count
-- (already has idx_host_applications_status)

-- conversations: fast lookup for participants
CREATE INDEX IF NOT EXISTS idx_conversations_participant_1 ON public.conversations (participant_1);
CREATE INDEX IF NOT EXISTS idx_conversations_participant_2 ON public.conversations (participant_2);
CREATE INDEX IF NOT EXISTS idx_conversations_last_message ON public.conversations (last_message_at DESC);

-- messages: fast conversation message loading
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON public.messages (conversation_id, created_at DESC);

-- followers: fast follower/following counts
CREATE INDEX IF NOT EXISTS idx_followers_following ON public.followers (following_id);
CREATE INDEX IF NOT EXISTS idx_followers_follower ON public.followers (follower_id);

-- notifications: fast user notification loading
CREATE INDEX IF NOT EXISTS idx_notifications_user ON public.notifications (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON public.notifications (user_id, is_read) WHERE is_read = false;

-- coin_transfers: fast lookup
CREATE INDEX IF NOT EXISTS idx_coin_transfers_receiver ON public.coin_transfers (receiver_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_coin_transfers_sender ON public.coin_transfers (sender_id, created_at DESC);

-- game_bets: fast user lookup
CREATE INDEX IF NOT EXISTS idx_game_bets_user ON public.game_bets (user_id, created_at DESC);

-- agency_hosts: fast agency host listing
CREATE INDEX IF NOT EXISTS idx_agency_hosts_agency ON public.agency_hosts (agency_id, status);
CREATE INDEX IF NOT EXISTS idx_agency_hosts_host ON public.agency_hosts (host_id);

-- 3. OPTIMIZE get_admin_dashboard_stats with parallel-safe subqueries
CREATE OR REPLACE FUNCTION public.get_admin_dashboard_stats()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '5s'
AS $$
DECLARE
  v_today timestamp := CURRENT_DATE::timestamp;
  v_result json;
BEGIN
  SELECT json_build_object(
    'total_users', (SELECT count(*) FROM profiles),
    'total_hosts', (SELECT count(*) FROM profiles WHERE is_host = true),
    'total_agencies', (SELECT count(*) FROM agencies WHERE is_active = true),
    'active_streams', (SELECT count(*) FROM live_streams WHERE is_active = true AND ended_at IS NULL),
    'active_party_rooms', (SELECT count(*) FROM party_rooms WHERE is_active = true),
    'total_gifts_today', COALESCE((SELECT sum(coin_amount) FROM gift_transactions WHERE created_at >= v_today), 0),
    'total_calls_today', (SELECT count(*) FROM private_calls WHERE created_at >= v_today),
    'online_users', (SELECT count(*) FROM profiles WHERE is_online = true),
    'blocked_users', (SELECT count(*) FROM profiles WHERE is_blocked = true),
    'blocked_agencies', (SELECT count(*) FROM agencies WHERE is_blocked = true),
    'pending_host_applications', (SELECT count(*) FROM host_applications WHERE status = 'pending'),
    'daily_reward_claims_today', (SELECT count(*) FROM daily_login_claims WHERE claimed_date = CURRENT_DATE),
    'daily_recharges_today', (SELECT count(*) FROM recharge_transactions WHERE created_at >= v_today)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

-- 4. Create optimized connection pool helper: auto-cleanup stale connections
CREATE OR REPLACE FUNCTION public.cleanup_stale_data()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '10s'
AS $$
BEGIN
  -- Mark users offline if no activity for 5 minutes
  UPDATE profiles 
  SET is_online = false 
  WHERE is_online = true 
    AND last_active_at < NOW() - INTERVAL '5 minutes';

  -- End stale live streams (no heartbeat for 3 minutes)
  UPDATE live_streams 
  SET is_active = false, ended_at = NOW() 
  WHERE is_active = true 
    AND last_heartbeat < NOW() - INTERVAL '3 minutes';

  -- Deactivate stale device tokens (not updated for 90 days)
  UPDATE device_tokens 
  SET is_active = false 
  WHERE is_active = true 
    AND updated_at < NOW() - INTERVAL '90 days';
END;
$$;
