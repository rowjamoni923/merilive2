-- Update preset_bets for all games to new values (500, 1000, 5000, 10000, 20000)
UPDATE public.game_settings
SET preset_bets = '[500, 1000, 5000, 10000, 20000]'::jsonb
WHERE game_id IN ('teen-patti', 'ferris-wheel', 'roulette');

-- Also update any other games that might have old preset_bets
UPDATE public.game_settings
SET preset_bets = '[500, 1000, 5000, 10000, 20000]'::jsonb
WHERE preset_bets IS NOT NULL 
AND preset_bets::text != '[500, 1000, 5000, 10000, 20000]';