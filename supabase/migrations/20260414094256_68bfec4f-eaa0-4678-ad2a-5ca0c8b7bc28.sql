
-- 1. increment_reel_view
CREATE OR REPLACE FUNCTION public.increment_reel_view(reel_uuid uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE reels SET view_count = COALESCE(view_count, 0) + 1 WHERE id = reel_uuid;
END;
$$;

-- 2. mark_messages_delivered
CREATE OR REPLACE FUNCTION public.mark_messages_delivered(
  p_conversation_id uuid,
  p_recipient_id uuid
)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  updated_count integer;
BEGIN
  UPDATE messages 
  SET is_delivered = true, delivered_at = now()
  WHERE conversation_id = p_conversation_id 
    AND sender_id != p_recipient_id 
    AND COALESCE(is_delivered, false) = false;
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count;
END;
$$;

-- 3. get_user_live_ban
CREATE OR REPLACE FUNCTION public.get_user_live_ban(p_user_id uuid)
RETURNS TABLE(
  ban_id uuid,
  ban_reason text,
  ban_start timestamptz,
  ban_end timestamptz,
  banned_by uuid
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  SELECT lb.id, lb.reason, lb.banned_at, lb.ban_expires_at, lb.banned_by
  FROM live_bans lb
  WHERE lb.user_id = p_user_id 
    AND lb.is_active = true
    AND (lb.ban_expires_at IS NULL OR lb.ban_expires_at > now())
  ORDER BY lb.banned_at DESC
  LIMIT 1;
END;
$$;

-- 4. is_user_live_banned
CREATE OR REPLACE FUNCTION public.is_user_live_banned(p_user_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM live_bans
    WHERE user_id = p_user_id 
      AND is_active = true
      AND (ban_expires_at IS NULL OR ban_expires_at > now())
  );
END;
$$;

-- 5. reject_host_request
CREATE OR REPLACE FUNCTION public.reject_host_request(
  _agency_id uuid,
  _host_id uuid,
  _rejector_id uuid
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE agency_hosts 
  SET status = 'rejected', left_at = now()
  WHERE agency_id = _agency_id AND host_id = _host_id AND status = 'pending';
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Request not found');
  END IF;
  
  RETURN jsonb_build_object('success', true);
END;
$$;

-- 6. request_account_deletion
CREATE OR REPLACE FUNCTION public.request_account_deletion(user_id_param uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM set_config('app.bypass_profile_protection', 'true', true);
  UPDATE profiles 
  SET deletion_requested_at = now(), 
      deletion_scheduled_for = now() + interval '30 days'
  WHERE id = user_id_param;
END;
$$;

-- 7. register_admin_device
CREATE OR REPLACE FUNCTION public.register_admin_device(
  _device_fingerprint text,
  _device_name text DEFAULT NULL,
  _device_info jsonb DEFAULT NULL,
  _ip_address text DEFAULT NULL,
  _user_agent text DEFAULT NULL
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO admin_allowed_devices (admin_user_id, device_fingerprint, device_name, device_info, ip_address, user_agent, status)
  VALUES (auth.uid(), _device_fingerprint, _device_name, _device_info::json, _ip_address, _user_agent, 'pending')
  ON CONFLICT (admin_user_id, device_fingerprint) DO UPDATE 
  SET last_used_at = now(), device_name = COALESCE(EXCLUDED.device_name, admin_allowed_devices.device_name);
END;
$$;

-- 8. is_admin_device_approved
CREATE OR REPLACE FUNCTION public.is_admin_device_approved(
  _user_id uuid,
  _device_fingerprint text
)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM admin_allowed_devices
    WHERE admin_user_id = _user_id 
      AND device_fingerprint = _device_fingerprint
      AND status = 'approved'
  );
END;
$$;

-- 9. update_admin_device_status
CREATE OR REPLACE FUNCTION public.update_admin_device_status(
  _device_id uuid,
  _new_status text,
  _notes text DEFAULT NULL
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE admin_allowed_devices 
  SET status = _new_status::admin_device_status, 
      notes = COALESCE(_notes, notes),
      approved_at = CASE WHEN _new_status = 'approved' THEN now() ELSE approved_at END,
      approved_by = CASE WHEN _new_status = 'approved' THEN auth.uid()::text ELSE approved_by END
  WHERE id = _device_id;
END;
$$;

-- 10. get_host_agency_request
CREATE OR REPLACE FUNCTION public.get_host_agency_request(_host_id uuid)
RETURNS TABLE(
  id uuid,
  agency_id uuid,
  host_id uuid,
  status text,
  joined_at timestamptz,
  agency_name text,
  agency_code text,
  agency_logo text
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  SELECT ah.id, ah.agency_id, ah.host_id, ah.status, ah.joined_at,
         a.name, a.agency_code, a.logo_url
  FROM agency_hosts ah
  JOIN agencies a ON a.id = ah.agency_id
  WHERE ah.host_id = _host_id
  ORDER BY ah.joined_at DESC;
END;
$$;

-- 11. get_host_earnings_leaderboard
CREATE OR REPLACE FUNCTION public.get_host_earnings_leaderboard(p_period_type text DEFAULT 'weekly')
RETURNS TABLE(
  user_id uuid,
  display_name text,
  avatar_url text,
  user_level integer,
  country_flag text,
  score bigint,
  rank bigint
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  start_date timestamptz;
BEGIN
  start_date := CASE p_period_type
    WHEN 'daily' THEN date_trunc('day', now())
    WHEN 'weekly' THEN date_trunc('week', now())
    WHEN 'monthly' THEN date_trunc('month', now())
    ELSE date_trunc('week', now())
  END;

  RETURN QUERY
  SELECT p.id, p.display_name, p.avatar_url, COALESCE(p.user_level, 1)::integer,
         p.country_flag,
         COALESCE(SUM(gt.receiver_earned), 0)::bigint AS score,
         ROW_NUMBER() OVER (ORDER BY COALESCE(SUM(gt.receiver_earned), 0) DESC)::bigint AS rank
  FROM gift_transactions gt
  JOIN profiles p ON p.id = gt.receiver_id
  WHERE gt.created_at >= start_date
  GROUP BY p.id, p.display_name, p.avatar_url, p.user_level, p.country_flag
  ORDER BY score DESC
  LIMIT 100;
END;
$$;

-- 12. get_top_gifters_leaderboard
CREATE OR REPLACE FUNCTION public.get_top_gifters_leaderboard(p_period_type text DEFAULT 'weekly')
RETURNS TABLE(
  user_id uuid,
  display_name text,
  avatar_url text,
  user_level integer,
  country_flag text,
  score bigint,
  rank bigint
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  start_date timestamptz;
BEGIN
  start_date := CASE p_period_type
    WHEN 'daily' THEN date_trunc('day', now())
    WHEN 'weekly' THEN date_trunc('week', now())
    WHEN 'monthly' THEN date_trunc('month', now())
    ELSE date_trunc('week', now())
  END;

  RETURN QUERY
  SELECT p.id, p.display_name, p.avatar_url, COALESCE(p.user_level, 1)::integer,
         p.country_flag,
         COALESCE(SUM(gt.coin_cost), 0)::bigint AS score,
         ROW_NUMBER() OVER (ORDER BY COALESCE(SUM(gt.coin_cost), 0) DESC)::bigint AS rank
  FROM gift_transactions gt
  JOIN profiles p ON p.id = gt.sender_id
  WHERE gt.created_at >= start_date
  GROUP BY p.id, p.display_name, p.avatar_url, p.user_level, p.country_flag
  ORDER BY score DESC
  LIMIT 100;
END;
$$;

-- 13. get_game_rankings_leaderboard
CREATE OR REPLACE FUNCTION public.get_game_rankings_leaderboard(p_period_type text DEFAULT 'weekly')
RETURNS TABLE(
  user_id uuid,
  display_name text,
  avatar_url text,
  user_level integer,
  country_flag text,
  score bigint,
  rank bigint
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  start_date timestamptz;
BEGIN
  start_date := CASE p_period_type
    WHEN 'daily' THEN date_trunc('day', now())
    WHEN 'weekly' THEN date_trunc('week', now())
    WHEN 'monthly' THEN date_trunc('month', now())
    ELSE date_trunc('week', now())
  END;

  RETURN QUERY
  SELECT p.id, p.display_name, p.avatar_url, COALESCE(p.user_level, 1)::integer,
         p.country_flag,
         COALESCE(SUM(gb.win_amount), 0)::bigint AS score,
         ROW_NUMBER() OVER (ORDER BY COALESCE(SUM(gb.win_amount), 0) DESC)::bigint AS rank
  FROM game_bets gb
  JOIN profiles p ON p.id = gb.user_id
  WHERE gb.created_at >= start_date AND gb.status = 'won'
  GROUP BY p.id, p.display_name, p.avatar_url, p.user_level, p.country_flag
  ORDER BY score DESC
  LIMIT 100;
END;
$$;
