-- Enable REPLICA IDENTITY FULL for profiles table for real-time updates
ALTER TABLE public.profiles REPLICA IDENTITY FULL;

-- Add profiles to realtime publication if not already
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'profiles'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
  END IF;
END $$;

-- Create a function for atomic cashout that updates both user coins and bet record
CREATE OR REPLACE FUNCTION public.game_cashout(
  p_user_id UUID,
  p_bet_id UUID,
  p_multiplier DECIMAL,
  p_win_amount INTEGER
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_coins INTEGER;
  v_new_coins INTEGER;
  v_result JSON;
BEGIN
  -- Lock and get current coins
  SELECT coins INTO v_current_coins
  FROM profiles
  WHERE id = p_user_id
  FOR UPDATE;

  -- Calculate new balance
  v_new_coins := v_current_coins + p_win_amount;

  -- Update user coins
  UPDATE profiles
  SET coins = v_new_coins
  WHERE id = p_user_id;

  -- Update bet record
  UPDATE live_game_bets
  SET 
    is_winner = true,
    win_amount = p_win_amount,
    multiplier = p_multiplier,
    is_processed = true,
    cashed_out_at = now()
  WHERE id = p_bet_id AND user_id = p_user_id;

  -- Log the transaction
  INSERT INTO game_bets (
    game_id, user_id, bet_amount, bet_type, 
    is_winner, win_amount, multiplier, result
  )
  SELECT 
    lgb.game_id, p_user_id, lgb.bet_amount, 'cashout',
    true, p_win_amount, p_multiplier, 
    jsonb_build_object('type', 'cashout', 'multiplier', p_multiplier, 'win_amount', p_win_amount)
  FROM live_game_bets lgb
  WHERE lgb.id = p_bet_id;

  v_result := json_build_object(
    'success', true,
    'new_balance', v_new_coins,
    'win_amount', p_win_amount,
    'multiplier', p_multiplier
  );

  RETURN v_result;
END;
$$;

-- Add cashed_out_at column to live_game_bets if not exists
ALTER TABLE public.live_game_bets ADD COLUMN IF NOT EXISTS cashed_out_at TIMESTAMPTZ;

-- Enable REPLICA IDENTITY FULL for live_game_bets for real-time
ALTER TABLE public.live_game_bets REPLICA IDENTITY FULL;

-- Add to realtime publication
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'live_game_bets'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.live_game_bets;
  END IF;
END $$;

-- Create game server control table
CREATE TABLE IF NOT EXISTS public.game_server_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_name TEXT NOT NULL DEFAULT 'Main Server',
  is_active BOOLEAN DEFAULT true,
  global_house_edge DECIMAL DEFAULT 5,
  max_total_payout_per_round INTEGER DEFAULT 10000000,
  maintenance_mode BOOLEAN DEFAULT false,
  maintenance_message TEXT,
  auto_process_enabled BOOLEAN DEFAULT true,
  round_interval_seconds INTEGER DEFAULT 20,
  betting_duration_seconds INTEGER DEFAULT 15,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.game_server_settings ENABLE ROW LEVEL SECURITY;

-- Admin only policy - using is_admin function
CREATE POLICY "Admins can manage game server settings"
  ON public.game_server_settings
  FOR ALL
  USING (public.is_admin(auth.uid()));

-- Allow read for authenticated users (for game client)
CREATE POLICY "Authenticated users can read game server settings"
  ON public.game_server_settings
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- Insert default settings
INSERT INTO public.game_server_settings (server_name)
VALUES ('Main Game Server')
ON CONFLICT DO NOTHING;

-- Create game rounds history view for admin
CREATE OR REPLACE VIEW public.game_rounds_stats AS
SELECT 
  lgr.game_id,
  gs.game_name,
  gs.game_emoji,
  COUNT(lgr.id) as total_rounds,
  SUM(lgr.total_bet_amount) as total_wagered,
  SUM(lgr.total_players) as total_players,
  COUNT(CASE WHEN lgr.status = 'active' THEN 1 END) as active_rounds,
  MAX(lgr.created_at) as last_round_at
FROM live_game_rounds lgr
LEFT JOIN game_settings gs ON gs.game_id = lgr.game_id
WHERE lgr.created_at > now() - interval '24 hours'
GROUP BY lgr.game_id, gs.game_name, gs.game_emoji;

-- Enable realtime for live_game_rounds
ALTER TABLE public.live_game_rounds REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'live_game_rounds'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.live_game_rounds;
  END IF;
END $$;