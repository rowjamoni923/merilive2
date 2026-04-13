-- Fix remaining Security Definer Views
DROP VIEW IF EXISTS public.agencies_public;
CREATE VIEW public.agencies_public WITH (security_invoker = true) AS
SELECT id, name, agency_code, logo_url, level, is_active, total_agents, total_hosts, created_at, owner_id
FROM agencies WHERE is_active = true AND (is_blocked = false OR is_blocked IS NULL);

DROP VIEW IF EXISTS public.game_rounds_stats;
CREATE VIEW public.game_rounds_stats WITH (security_invoker = true) AS
SELECT lgr.game_id, gs.game_name, gs.game_emoji,
  count(lgr.id) AS total_rounds,
  sum(lgr.total_bet_amount) AS total_wagered,
  sum(lgr.total_players) AS total_players,
  count(CASE WHEN lgr.status = 'active' THEN 1 ELSE NULL END) AS active_rounds,
  max(lgr.created_at) AS last_round_at
FROM live_game_rounds lgr LEFT JOIN game_settings gs ON gs.game_id = lgr.game_id
WHERE lgr.created_at > (now() - interval '24 hours')
GROUP BY lgr.game_id, gs.game_name, gs.game_emoji;