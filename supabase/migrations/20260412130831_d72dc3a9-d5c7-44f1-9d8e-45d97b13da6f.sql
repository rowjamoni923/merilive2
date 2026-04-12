-- live_game_rounds missing columns  
ALTER TABLE public.live_game_rounds ADD COLUMN IF NOT EXISTS game_id text;
ALTER TABLE public.live_game_rounds ADD COLUMN IF NOT EXISTS room_id uuid;
ALTER TABLE public.live_game_rounds ADD COLUMN IF NOT EXISTS betting_end_at timestamptz;
ALTER TABLE public.live_game_rounds ADD COLUMN IF NOT EXISTS game_start_at timestamptz;
ALTER TABLE public.live_game_rounds ADD COLUMN IF NOT EXISTS game_end_at timestamptz;
ALTER TABLE public.live_game_rounds ADD COLUMN IF NOT EXISTS total_bets integer DEFAULT 0;
ALTER TABLE public.live_game_rounds ADD COLUMN IF NOT EXISTS total_bet_amount integer DEFAULT 0;
ALTER TABLE public.live_game_rounds ADD COLUMN IF NOT EXISTS total_players integer DEFAULT 0;
ALTER TABLE public.live_game_rounds ADD COLUMN IF NOT EXISTS winning_value text;
ALTER TABLE public.live_game_rounds ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

-- game_settings missing columns
ALTER TABLE public.game_settings ADD COLUMN IF NOT EXISTS game_id text;
ALTER TABLE public.game_settings ADD COLUMN IF NOT EXISTS game_name text;
ALTER TABLE public.game_settings ADD COLUMN IF NOT EXISTS game_emoji text;
ALTER TABLE public.game_settings ADD COLUMN IF NOT EXISTS game_color text;
ALTER TABLE public.game_settings ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE public.game_settings ADD COLUMN IF NOT EXISTS min_bet integer DEFAULT 10;
ALTER TABLE public.game_settings ADD COLUMN IF NOT EXISTS max_bet integer DEFAULT 10000;
ALTER TABLE public.game_settings ADD COLUMN IF NOT EXISTS win_probability numeric(5,2) DEFAULT 50.00;
ALTER TABLE public.game_settings ADD COLUMN IF NOT EXISTS house_edge numeric(5,2) DEFAULT 5.00;
ALTER TABLE public.game_settings ADD COLUMN IF NOT EXISTS max_multiplier numeric(10,2) DEFAULT 10.00;
ALTER TABLE public.game_settings ADD COLUMN IF NOT EXISTS is_featured boolean DEFAULT false;
ALTER TABLE public.game_settings ADD COLUMN IF NOT EXISTS rules jsonb DEFAULT '{}'::jsonb;
ALTER TABLE public.game_settings ADD COLUMN IF NOT EXISTS preset_bets jsonb DEFAULT '[5000, 10000, 20000, 50000, 100000, 200000]'::jsonb;
ALTER TABLE public.game_settings ADD COLUMN IF NOT EXISTS game_url text;
ALTER TABLE public.game_settings ADD COLUMN IF NOT EXISTS logo_url text;
ALTER TABLE public.game_settings ADD COLUMN IF NOT EXISTS iframe_width integer DEFAULT 100;
ALTER TABLE public.game_settings ADD COLUMN IF NOT EXISTS iframe_height integer DEFAULT 400;
ALTER TABLE public.game_settings ADD COLUMN IF NOT EXISTS jackpot_percentage numeric(5,2) DEFAULT 0;
ALTER TABLE public.game_settings ADD COLUMN IF NOT EXISTS jackpot_multiplier numeric(10,2) DEFAULT 100;
ALTER TABLE public.game_settings ADD COLUMN IF NOT EXISTS min_win_probability numeric(5,2) DEFAULT 5;
ALTER TABLE public.game_settings ADD COLUMN IF NOT EXISTS max_win_probability numeric(5,2) DEFAULT 95;
ALTER TABLE public.game_settings ADD COLUMN IF NOT EXISTS category text DEFAULT 'casino';
ALTER TABLE public.game_settings ADD COLUMN IF NOT EXISTS provider_id uuid;
ALTER TABLE public.game_settings ADD COLUMN IF NOT EXISTS provider_game_code text;