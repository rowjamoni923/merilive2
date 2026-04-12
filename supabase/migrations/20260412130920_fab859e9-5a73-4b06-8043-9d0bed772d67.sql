DROP TABLE IF EXISTS public.game_rounds_stats CASCADE;

CREATE VIEW public.game_rounds_stats WITH (security_invoker = true) AS
SELECT lgr.game_id,
    gs.game_name,
    gs.game_emoji,
    count(lgr.id) AS total_rounds,
    sum(lgr.total_bet_amount) AS total_wagered,
    sum(lgr.total_players) AS total_players,
    count(
        CASE
            WHEN lgr.status = 'active' THEN 1
            ELSE NULL::integer
        END) AS active_rounds,
    max(lgr.created_at) AS last_round_at
FROM public.live_game_rounds lgr
LEFT JOIN public.game_settings gs ON gs.game_id = lgr.game_id
WHERE lgr.created_at > (now() - '24:00:00'::interval)
GROUP BY lgr.game_id, gs.game_name, gs.game_emoji;