-- Pkg313 (Leaderboards & Rankings) deep audit pass-1
-- CRITICAL: reward distribution RPCs were SECURITY DEFINER + grantable to
-- anon/authenticated. Any caller could POST to /rest/v1/rpc/distribute_period_rewards
-- with arbitrary {p_category, p_period_type} and force premature payouts /
-- mass-notification spam, bypassing the edge function entirely.
-- Lock these to service_role only; edge fns continue to invoke them with
-- service-role key.

REVOKE EXECUTE ON FUNCTION public.auto_distribute_leaderboard_rewards() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.distribute_period_rewards(text, text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.auto_distribute_leaderboard_rewards() TO service_role;
GRANT EXECUTE ON FUNCTION public.distribute_period_rewards(text, text) TO service_role;

-- Read-only leaderboard RPCs (get_host_earnings_leaderboard, get_game_rankings_leaderboard,
-- get_top_gifters_leaderboard) deliberately remain callable by anon/authenticated -
-- they only project public leaderboard rows for display.