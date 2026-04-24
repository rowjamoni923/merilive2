
DROP VIEW IF EXISTS public.profiles_public CASCADE;

CREATE VIEW public.profiles_public
WITH (security_invoker = on) AS
SELECT
  id, username, display_name, bio, avatar_url, cover_url,
  country_code, country_name, country_flag, age, gender,
  is_online, is_verified, last_seen_at, last_seen, last_active_at,
  is_host, host_status, host_level, host_availability,
  is_face_verified, face_verified_at, host_verified_at, verification_type,
  agency_id, is_agency_owner,
  is_in_call, call_rate_per_minute, total_call_minutes, total_calls_received,
  user_level, max_user_level,
  tags, city, region, hide_location,
  frame_id, equipped_frame_id, equipped_entrance_id, equipped_bubble_id,
  equipped_vehicle_id, equipped_medal_id, equipped_noble_card_id,
  equipped_entry_banner_id, equipped_entry_name_bar_id,
  current_vip_tier_id, vip_tier, vip_expires_at,
  weekly_earnings, total_earnings,
  is_blocked, is_banned, is_deleted,
  profile_photo_url, host_photos, app_uid, created_at
FROM public.profiles
WHERE COALESCE(is_deleted, false) = false;

GRANT SELECT ON public.profiles_public TO anon, authenticated;

DROP VIEW IF EXISTS public.agencies_public CASCADE;

CREATE VIEW public.agencies_public
WITH (security_invoker = on) AS
SELECT
  id, name, agency_code, logo_url, level,
  total_hosts, total_agents, is_active, parent_agency_id,
  created_at
FROM public.agencies
WHERE COALESCE(is_active, true) = true;

GRANT SELECT ON public.agencies_public TO anon, authenticated;
