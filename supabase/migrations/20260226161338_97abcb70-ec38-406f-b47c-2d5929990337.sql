-- Clean up all stale roulette sessions
UPDATE roulette_sessions SET status = 'completed', completed_at = now(), winning_number = floor(random() * 37)::int WHERE status IN ('betting', 'spinning');