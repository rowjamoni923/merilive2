
-- 1. Create missing coin_transactions table
CREATE TABLE IF NOT EXISTS public.coin_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  coins_amount INTEGER NOT NULL DEFAULT 0,
  transaction_type TEXT NOT NULL DEFAULT 'purchase',
  payment_method TEXT,
  payment_reference TEXT,
  status TEXT DEFAULT 'completed',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.coin_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own coin transactions"
  ON public.coin_transactions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admin full access coin_transactions"
  ON public.coin_transactions FOR ALL
  TO authenticated
  USING (public.is_admin(auth.uid()));

-- 2. Add missing columns to existing tables
ALTER TABLE public.chat_moderation_logs 
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();

ALTER TABLE public.currency_rates 
  ADD COLUMN IF NOT EXISTS country_code TEXT;

ALTER TABLE public.game_settings 
  ADD COLUMN IF NOT EXISTS display_order INTEGER DEFAULT 0;

ALTER TABLE public.coin_transfers 
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'completed';

ALTER TABLE public.rating_reward_claims 
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'claimed';

ALTER TABLE public.consumption_return_history 
  ADD COLUMN IF NOT EXISTS is_claimed BOOLEAN DEFAULT false;

ALTER TABLE public.leaderboard_reward_history 
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'completed';

ALTER TABLE public.live_face_violations 
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending';

ALTER TABLE public.face_verification_submissions 
  ADD COLUMN IF NOT EXISTS verification_type TEXT DEFAULT 'face';

ALTER TABLE public.helper_message_replies 
  ADD COLUMN IF NOT EXISTS is_read BOOLEAN DEFAULT false;

ALTER TABLE public.helper_level_config 
  ADD COLUMN IF NOT EXISTS is_enabled BOOLEAN DEFAULT true;

ALTER TABLE public.live_streams 
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();

ALTER TABLE public.leaderboard_reward_config 
  ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'general';

ALTER TABLE public.leaderboard_podium_frames 
  ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'general';

-- 3. Add missing columns to party_room_backgrounds
ALTER TABLE public.party_room_backgrounds 
  ADD COLUMN IF NOT EXISTS gradient_css TEXT,
  ADD COLUMN IF NOT EXISTS is_premium BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS price_diamonds INTEGER DEFAULT 0;

-- 4. Backfill price_diamonds from price_coins
UPDATE public.party_room_backgrounds 
  SET price_diamonds = COALESCE(price_coins, 0) 
  WHERE price_diamonds IS NULL OR price_diamonds = 0;

-- 5. Backfill chat_moderation_logs.created_at from detected_at
UPDATE public.chat_moderation_logs 
  SET created_at = COALESCE(detected_at, now()) 
  WHERE created_at IS NULL;
