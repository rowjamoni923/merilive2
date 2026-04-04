
-- 1. Function to fully enforce permanent ban
CREATE OR REPLACE FUNCTION public.enforce_permanent_ban()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.is_blocked = true AND (OLD.is_blocked IS NOT TRUE) THEN
    NEW.is_host := false;
    NEW.host_status := 'rejected';
    NEW.is_online := false;
    NEW.is_in_call := false;
    NEW.active_session_id := null;
    
    UPDATE agency_hosts SET status = 'removed', left_at = now()
    WHERE host_id = NEW.id AND status = 'active';
    
    UPDATE agencies SET is_blocked = true, is_active = false,
      blocked_at = now(), blocked_reason = 'Owner permanently banned'
    WHERE owner_id = NEW.id AND is_blocked IS NOT TRUE;
    
    DELETE FROM follows WHERE follower_id = NEW.id OR following_id = NEW.id;
    
    UPDATE live_streams SET status = 'ended', ended_at = now()
    WHERE host_id = NEW.id AND status = 'live';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_enforce_permanent_ban ON profiles;
CREATE TRIGGER trigger_enforce_permanent_ban
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_permanent_ban();

-- 2. Check ban on login RPC
CREATE OR REPLACE FUNCTION public.check_ban_on_login(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_blocked boolean;
  v_reason text;
  v_device_id text;
BEGIN
  SELECT is_blocked, blocked_reason, device_id
  INTO v_blocked, v_reason, v_device_id
  FROM profiles WHERE id = p_user_id;
  
  IF v_blocked = true THEN
    RETURN jsonb_build_object('banned', true, 'reason', COALESCE(v_reason, 'Account permanently banned'));
  END IF;
  
  IF v_device_id IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM banned_devices WHERE device_id = v_device_id AND is_permanent = true) THEN
      UPDATE profiles SET is_blocked = true, blocked_reason = 'Device permanently banned' WHERE id = p_user_id;
      RETURN jsonb_build_object('banned', true, 'reason', 'Device permanently banned');
    END IF;
  END IF;
  
  RETURN jsonb_build_object('banned', false);
END;
$$;

-- 3. Recreate profiles_public view to HIDE banned users
CREATE OR REPLACE VIEW public.profiles_public
WITH (security_invoker=on) AS
SELECT id, display_name, username, avatar_url, bio,
  country_code, country_flag, country_name, city, region,
  user_level, host_level, previous_host_level,
  is_online, is_in_call, is_host, gender,
  call_rate_per_minute, is_verified, is_face_verified,
  created_at, frame_id, is_blocked, last_seen_at,
  equipped_frame_id, equipped_entrance_id, equipped_bubble_id,
  equipped_vehicle_id, equipped_entry_banner_id,
  equipped_entry_name_bar_id, equipped_medal_id,
  equipped_noble_card_id, current_vip_tier_id,
  vip_expires_at, age, tags, cover_url, app_uid, hide_location
FROM profiles
WHERE is_blocked IS NOT TRUE;
