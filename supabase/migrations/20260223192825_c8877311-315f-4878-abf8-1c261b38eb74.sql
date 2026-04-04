
-- ============================================================
-- SECURITY FIX: Create profiles_public view to hide sensitive data
-- ============================================================
CREATE OR REPLACE VIEW public.profiles_public
WITH (security_invoker = on) AS
  SELECT 
    id, display_name, username, avatar_url, bio, 
    country_code, country_flag, user_level, host_level,
    is_online, is_in_call, is_host, gender, 
    call_rate_per_minute, is_verified, is_face_verified,
    created_at, frame_id, is_blocked, last_seen_at,
    equipped_frame_id, equipped_entrance_id, equipped_bubble_id,
    equipped_vehicle_id, equipped_entry_banner_id, equipped_entry_name_bar_id,
    equipped_medal_id, equipped_noble_card_id,
    current_vip_tier_id, vip_expires_at, age, tags,
    cover_url, app_uid, hide_location
  FROM public.profiles;
  -- Excludes: coins, beans, diamonds, device_id, registration_ip, 
  -- last_login_ip, device_info, face_hash, face_verification_image, 
  -- total_earnings, pending_earnings, etc.

-- ============================================================
-- Restrict profiles base table - replace overly permissive policy
-- ============================================================
DROP POLICY IF EXISTS "Anyone can view profiles" ON profiles;

-- Users can view their OWN full profile (all columns including coins, beans etc)
CREATE POLICY "Users can view own full profile" ON profiles
  FOR SELECT
  USING (is_real_user() AND auth.uid() = id);

-- Authenticated users can view other profiles (needed for app features)
-- but should use profiles_public view in code to hide sensitive columns
CREATE POLICY "Authenticated users can view other profiles" ON profiles
  FOR SELECT
  USING (is_real_user() AND auth.uid() IS NOT NULL);
