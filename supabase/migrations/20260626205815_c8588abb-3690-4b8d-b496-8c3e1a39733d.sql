CREATE OR REPLACE VIEW public.profiles_public
WITH (security_invoker=on) AS
SELECT id, username, display_name, bio, avatar_url, cover_url,
  country_code, country_name, country_flag, age, gender,
  is_online, is_verified, last_seen_at, last_seen, last_active_at,
  is_host, host_status, host_level, host_availability,
  is_face_verified, face_verification_status, face_verified_at,
  host_verified_at, verification_type, agency_id, is_agency_owner,
  is_in_call, call_rate_per_minute, total_call_minutes, total_calls_received,
  user_level, max_user_level, tags,
  CASE WHEN COALESCE(hide_location, false) THEN NULL::text ELSE city END AS city,
  CASE WHEN COALESCE(hide_location, false) THEN NULL::text ELSE region END AS region,
  hide_location,
  frame_id, equipped_frame_id, equipped_entrance_id, equipped_bubble_id,
  equipped_vehicle_id, equipped_medal_id, equipped_noble_card_id,
  equipped_entry_banner_id, equipped_entry_name_bar_id,
  current_vip_tier_id, vip_tier, vip_expires_at,
  weekly_earnings, total_earnings, profile_photo_url, host_photos,
  app_uid, created_at,
  COALESCE(hide_gift_senders, false) AS hide_gift_senders
FROM public.profiles p
WHERE COALESCE(is_banned, false) = false AND COALESCE(is_deleted, false) = false;

GRANT SELECT ON public.profiles_public TO anon, authenticated;