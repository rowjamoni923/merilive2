-- Remove external cartoon/free games that don't work
DELETE FROM game_settings WHERE game_type = 'external';

-- Make sure internal casino games are active and properly configured
UPDATE game_settings SET is_active = true WHERE game_type = 'internal' OR game_type IS NULL;

-- Update categories for better organization
UPDATE game_settings SET category = 'crash' WHERE game_id IN ('crash', 'aviator');
UPDATE game_settings SET category = 'casino' WHERE game_id IN ('wheel', 'slots', 'plinko', 'limbo');
UPDATE game_settings SET category = 'dice' WHERE game_id IN ('dice', 'lucky28', 'coinflip');
UPDATE game_settings SET category = 'cards' WHERE game_id IN ('dragon_tiger', 'andar_bahar', 'baccarat', 'blackjack', 'hilo');
UPDATE game_settings SET category = 'classic' WHERE game_id IN ('mines', 'roulette');