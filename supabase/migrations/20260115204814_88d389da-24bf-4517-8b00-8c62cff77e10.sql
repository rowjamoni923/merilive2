-- Add jackpot settings columns to game_settings table
ALTER TABLE public.game_settings 
ADD COLUMN IF NOT EXISTS jackpot_percentage NUMERIC(5,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS jackpot_multiplier NUMERIC(10,2) DEFAULT 100,
ADD COLUMN IF NOT EXISTS min_win_probability NUMERIC(5,2) DEFAULT 5,
ADD COLUMN IF NOT EXISTS max_win_probability NUMERIC(5,2) DEFAULT 95,
ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'casino';

-- Update existing games with categories
UPDATE public.game_settings SET category = 'crash' WHERE game_id IN ('crash', 'aviator');
UPDATE public.game_settings SET category = 'casino' WHERE game_id IN ('wheel', 'slots', 'plinko', 'limbo');
UPDATE public.game_settings SET category = 'dice' WHERE game_id IN ('dice', 'lucky28');
UPDATE public.game_settings SET category = 'cards' WHERE game_id IN ('dragon_tiger', 'andar_bahar', 'baccarat', 'blackjack', 'hilo');
UPDATE public.game_settings SET category = 'classic' WHERE game_id IN ('coinflip', 'mines', 'roulette');

-- Set default jackpot values
UPDATE public.game_settings SET 
  jackpot_percentage = 1.5,
  jackpot_multiplier = 500,
  min_win_probability = 10,
  max_win_probability = 75
WHERE game_id = 'slots';

UPDATE public.game_settings SET 
  jackpot_percentage = 0.5,
  jackpot_multiplier = 100,
  min_win_probability = 15,
  max_win_probability = 60
WHERE game_id IN ('crash', 'aviator');

UPDATE public.game_settings SET 
  jackpot_percentage = 1,
  jackpot_multiplier = 200,
  min_win_probability = 20,
  max_win_probability = 70
WHERE game_id = 'wheel';

UPDATE public.game_settings SET 
  jackpot_percentage = 0,
  jackpot_multiplier = 0,
  min_win_probability = 40,
  max_win_probability = 55
WHERE game_id IN ('coinflip', 'dice');

UPDATE public.game_settings SET 
  jackpot_percentage = 2,
  jackpot_multiplier = 1000,
  min_win_probability = 5,
  max_win_probability = 50
WHERE game_id = 'plinko';

UPDATE public.game_settings SET 
  jackpot_percentage = 0.3,
  jackpot_multiplier = 50,
  min_win_probability = 30,
  max_win_probability = 55
WHERE game_id IN ('dragon_tiger', 'andar_bahar', 'baccarat', 'blackjack', 'hilo');

UPDATE public.game_settings SET 
  jackpot_percentage = 1,
  jackpot_multiplier = 300,
  min_win_probability = 10,
  max_win_probability = 60
WHERE game_id = 'roulette';

UPDATE public.game_settings SET 
  jackpot_percentage = 3,
  jackpot_multiplier = 500,
  min_win_probability = 20,
  max_win_probability = 80
WHERE game_id = 'mines';