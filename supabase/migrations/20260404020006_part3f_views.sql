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

CREATE VIEW public.agencies_public AS
SELECT 
  id, name, agency_code, logo_url, level, is_active,
  total_agents, total_hosts, created_at, owner_id
FROM public.agencies
WHERE is_active = true AND (is_blocked = false OR is_blocked IS NULL);

CREATE VIEW public.game_rounds_stats 
WITH (security_invoker = true)
AS
SELECT lgr.game_id,
    gs.game_name,
    gs.game_emoji,
    count(lgr.id) AS total_rounds,
    sum(lgr.total_bet_amount) AS total_wagered,
    sum(lgr.total_players) AS total_players,
    count(CASE WHEN lgr.status = 'active' THEN 1 ELSE NULL END) AS active_rounds,
    max(lgr.created_at) AS last_round_at
FROM live_game_rounds lgr
LEFT JOIN game_settings gs ON gs.game_id = lgr.game_id
WHERE lgr.created_at > (now() - '24:00:00'::interval)
GROUP BY lgr.game_id, gs.game_name, gs.game_emoji;

