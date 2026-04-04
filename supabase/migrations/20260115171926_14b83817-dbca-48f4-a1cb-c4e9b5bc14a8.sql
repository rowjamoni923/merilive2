-- Add preset bet amounts to game_settings table
ALTER TABLE public.game_settings 
ADD COLUMN IF NOT EXISTS preset_bets JSONB DEFAULT '[5000, 10000, 20000, 50000, 100000, 200000]'::jsonb;

-- Update existing games with default preset bets
UPDATE public.game_settings 
SET preset_bets = '[5000, 10000, 20000, 50000, 100000, 200000]'::jsonb
WHERE preset_bets IS NULL;