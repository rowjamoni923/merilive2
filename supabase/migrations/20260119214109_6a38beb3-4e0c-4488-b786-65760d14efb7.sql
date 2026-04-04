-- Remove ALL current internal games
DELETE FROM game_settings;

-- Keep game_providers table for API integration
-- Reset live_game_rounds and game_bets as they reference deleted games
DELETE FROM live_game_bets WHERE 1=1;
DELETE FROM live_game_rounds WHERE 1=1;