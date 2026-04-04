
-- Create game_settings table for admin control
CREATE TABLE public.game_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  game_id TEXT NOT NULL UNIQUE,
  game_name TEXT NOT NULL,
  game_emoji TEXT NOT NULL,
  game_color TEXT NOT NULL,
  description TEXT,
  min_bet INTEGER DEFAULT 10,
  max_bet INTEGER DEFAULT 10000,
  win_probability DECIMAL(5,2) DEFAULT 50.00,
  house_edge DECIMAL(5,2) DEFAULT 5.00,
  max_multiplier DECIMAL(10,2) DEFAULT 10.00,
  is_active BOOLEAN DEFAULT TRUE,
  is_featured BOOLEAN DEFAULT FALSE,
  display_order INTEGER DEFAULT 0,
  rules JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.game_settings ENABLE ROW LEVEL SECURITY;

-- RLS Policies - Public read for active games
CREATE POLICY "Anyone can view active games" 
ON public.game_settings 
FOR SELECT 
USING (is_active = true);

-- Authenticated users can view all games (for admin check in app)
CREATE POLICY "Authenticated can view all games" 
ON public.game_settings 
FOR SELECT 
USING (auth.uid() IS NOT NULL);

-- Authenticated users can update (admin check in app layer)
CREATE POLICY "Authenticated can update games" 
ON public.game_settings 
FOR UPDATE 
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated can insert games" 
ON public.game_settings 
FOR INSERT 
WITH CHECK (auth.uid() IS NOT NULL);

-- Create game_bets table to track all bets
CREATE TABLE public.game_bets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID REFERENCES public.game_sessions(id) ON DELETE SET NULL,
  user_id UUID NOT NULL REFERENCES public.profiles(id),
  game_id TEXT NOT NULL,
  bet_amount INTEGER NOT NULL,
  bet_type TEXT,
  bet_value TEXT,
  win_amount INTEGER DEFAULT 0,
  multiplier DECIMAL(10,2) DEFAULT 0,
  result TEXT,
  is_winner BOOLEAN DEFAULT FALSE,
  game_data JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.game_bets ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view own bets" 
ON public.game_bets 
FOR SELECT 
USING (user_id = auth.uid());

CREATE POLICY "Authenticated can view all bets" 
ON public.game_bets 
FOR SELECT 
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can place bets" 
ON public.game_bets 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

-- Create game_stats table for analytics
CREATE TABLE public.game_stats (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  game_id TEXT NOT NULL,
  stat_date DATE DEFAULT CURRENT_DATE,
  total_bets INTEGER DEFAULT 0,
  total_bet_amount INTEGER DEFAULT 0,
  total_wins INTEGER DEFAULT 0,
  total_win_amount INTEGER DEFAULT 0,
  house_profit INTEGER DEFAULT 0,
  unique_players INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(game_id, stat_date)
);

-- Enable RLS
ALTER TABLE public.game_stats ENABLE ROW LEVEL SECURITY;

-- Admins can view stats
CREATE POLICY "Authenticated can view game stats" 
ON public.game_stats 
FOR SELECT 
USING (auth.uid() IS NOT NULL);

-- Insert default 10 games
INSERT INTO public.game_settings (game_id, game_name, game_emoji, game_color, description, min_bet, max_bet, win_probability, house_edge, max_multiplier, display_order, rules) VALUES
('lucky28', 'Lucky 28', '🎰', 'from-orange-400 to-red-500', 'ডাইস রোল করে 28 এর কাছাকাছি নম্বর অনুমান করুন এবং জিতুন!', 10, 5000, 48.00, 5.00, 5.00, 1, '{"type": "dice", "rounds": 3, "target": 28}'),
('ludo', 'Ludo King', '🎲', 'from-blue-400 to-purple-500', 'ক্লাসিক লুডু গেম - টোকেন হোমে পৌঁছান এবং জিতুন!', 20, 10000, 25.00, 5.00, 4.00, 2, '{"type": "board", "players": [2,4], "tokens": 4}'),
('poker', 'Teen Patti', '🃏', 'from-green-400 to-teal-500', 'ভারতীয় পোকার - সেরা তিন পাত্তা দেখান!', 50, 20000, 45.00, 3.00, 10.00, 3, '{"type": "cards", "deck": 52, "hand": 3}'),
('crash', 'Crash Rocket', '🚀', 'from-yellow-400 to-amber-500', 'রকেট উড়ছে! ক্র্যাশ হওয়ার আগে ক্যাশ আউট করুন!', 10, 50000, 55.00, 4.00, 100.00, 4, '{"type": "multiplier", "crash_range": [1.0, 100.0]}'),
('wheel', 'Lucky Wheel', '🎡', 'from-violet-400 to-purple-600', 'চাকা ঘুরান এবং প্রাইজ জিতুন!', 10, 5000, 40.00, 5.00, 50.00, 5, '{"type": "wheel", "segments": 12}'),
('dice', 'Dice Duel', '🎯', 'from-rose-400 to-pink-600', 'হাই বা লো বেট করুন - ডাইসের উপর নির্ভর করছে ভাগ্য!', 10, 10000, 49.00, 2.00, 2.00, 6, '{"type": "dice", "sides": 6, "bet_types": ["high", "low", "exact"]}'),
('coinflip', 'Coin Flip', '🪙', 'from-amber-400 to-yellow-600', 'হেড বা টেইল - 50-50 চান্স!', 10, 20000, 50.00, 2.00, 2.00, 7, '{"type": "coinflip", "options": ["heads", "tails"]}'),
('mines', 'Diamond Mines', '💎', 'from-cyan-400 to-blue-600', 'মাইনফিল্ডে ডায়মন্ড খুঁজুন - মাইন এড়িয়ে চলুন!', 10, 15000, 35.00, 3.00, 25.00, 8, '{"type": "grid", "size": [5,5], "mines": 5}'),
('hilo', 'Hi-Lo Cards', '🂡', 'from-emerald-400 to-green-600', 'পরের কার্ড কি হাই না লো? অনুমান করুন!', 10, 10000, 47.00, 3.00, 12.00, 9, '{"type": "cards", "deck": 52, "streak_bonus": true}'),
('slots', 'Mega Slots', '🎰', 'from-fuchsia-400 to-pink-600', '3টি মিলিয়ে জ্যাকপট জিতুন!', 10, 5000, 30.00, 8.00, 100.00, 10, '{"type": "slots", "reels": 3, "symbols": 7}');

-- Function to process game result
CREATE OR REPLACE FUNCTION process_game_bet(
  p_user_id UUID,
  p_game_id TEXT,
  p_bet_amount INTEGER,
  p_bet_type TEXT DEFAULT NULL,
  p_bet_value TEXT DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_game_settings RECORD;
  v_is_winner BOOLEAN;
  v_multiplier DECIMAL;
  v_win_amount INTEGER;
  v_random DECIMAL;
  v_user_coins INTEGER;
  v_result JSONB;
BEGIN
  -- Get game settings
  SELECT * INTO v_game_settings FROM game_settings WHERE game_id = p_game_id AND is_active = true;
  
  IF v_game_settings IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Game not found or inactive');
  END IF;
  
  -- Check bet limits
  IF p_bet_amount < v_game_settings.min_bet OR p_bet_amount > v_game_settings.max_bet THEN
    RETURN jsonb_build_object('success', false, 'error', 'Bet amount out of range');
  END IF;
  
  -- Check user balance
  SELECT coins INTO v_user_coins FROM profiles WHERE id = p_user_id;
  IF v_user_coins < p_bet_amount THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient balance');
  END IF;
  
  -- Deduct bet amount
  UPDATE profiles SET coins = coins - p_bet_amount WHERE id = p_user_id;
  
  -- Generate random result based on win probability
  v_random := random() * 100;
  v_is_winner := v_random < v_game_settings.win_probability;
  
  IF v_is_winner THEN
    -- Calculate win amount with random multiplier
    v_multiplier := 1.5 + (random() * (v_game_settings.max_multiplier - 1.5));
    v_win_amount := FLOOR(p_bet_amount * v_multiplier);
    
    -- Credit winnings
    UPDATE profiles SET coins = coins + v_win_amount WHERE id = p_user_id;
  ELSE
    v_multiplier := 0;
    v_win_amount := 0;
  END IF;
  
  -- Record the bet
  INSERT INTO game_bets (user_id, game_id, bet_amount, bet_type, bet_value, win_amount, multiplier, is_winner, result)
  VALUES (p_user_id, p_game_id, p_bet_amount, p_bet_type, p_bet_value, v_win_amount, v_multiplier, v_is_winner, 
    CASE WHEN v_is_winner THEN 'win' ELSE 'lose' END);
  
  -- Update daily stats
  INSERT INTO game_stats (game_id, stat_date, total_bets, total_bet_amount, total_wins, total_win_amount, house_profit, unique_players)
  VALUES (p_game_id, CURRENT_DATE, 1, p_bet_amount, CASE WHEN v_is_winner THEN 1 ELSE 0 END, v_win_amount, 
    p_bet_amount - v_win_amount, 1)
  ON CONFLICT (game_id, stat_date) DO UPDATE SET
    total_bets = game_stats.total_bets + 1,
    total_bet_amount = game_stats.total_bet_amount + p_bet_amount,
    total_wins = game_stats.total_wins + CASE WHEN v_is_winner THEN 1 ELSE 0 END,
    total_win_amount = game_stats.total_win_amount + v_win_amount,
    house_profit = game_stats.house_profit + (p_bet_amount - v_win_amount),
    updated_at = now();
  
  RETURN jsonb_build_object(
    'success', true,
    'is_winner', v_is_winner,
    'multiplier', v_multiplier,
    'win_amount', v_win_amount,
    'bet_amount', p_bet_amount,
    'new_balance', (SELECT coins FROM profiles WHERE id = p_user_id)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
