-- Add missing columns to gifts
ALTER TABLE public.gifts ADD COLUMN IF NOT EXISTS sound_url TEXT;
ALTER TABLE public.gifts ADD COLUMN IF NOT EXISTS sound_duration_ms INTEGER;

-- Add missing columns to categories  
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS image_url TEXT;

-- Add missing column to currency_rates
ALTER TABLE public.currency_rates ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- Add missing column to daily_login_rewards_config
ALTER TABLE public.daily_login_rewards_config ADD COLUMN IF NOT EXISTS description TEXT;