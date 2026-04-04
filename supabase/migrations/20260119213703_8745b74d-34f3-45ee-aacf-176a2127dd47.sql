-- Remove games that don't have proper components yet
DELETE FROM game_settings WHERE game_id IN ('poker', 'war');

-- Update all game types to internal to avoid confusion
UPDATE game_settings SET game_type = 'internal' WHERE game_type = 'native';

-- Remove any game_url references
UPDATE game_settings SET game_url = NULL WHERE game_url IS NOT NULL;