-- Insert native games into game_settings
INSERT INTO game_settings (
  game_id, game_name, game_emoji, game_color, description,
  min_bet, max_bet, win_probability, house_edge, max_multiplier,
  is_active, is_featured, display_order, preset_bets, category, game_type, game_url
) VALUES 
(
  'roulette',
  'Roulette',
  '🎰',
  'from-green-500 to-emerald-600',
  'Classic casino roulette with European wheel. Bet on numbers, colors, or ranges!',
  100, 500000, 48.65, 2.7, 36,
  true, true, 1,
  '[100, 200, 300, 400, 500]'::jsonb,
  'casino',
  'native',
  '/games/roulette'
),
(
  'ferris-wheel',
  'Ferris Wheel',
  '🎡',
  'from-sky-400 to-blue-500',
  'Spin the food wheel and win up to 45x! Pick your lucky food item.',
  100, 400000, 35, 8, 45,
  true, true, 2,
  '[100, 200, 300, 400]'::jsonb,
  'casino',
  'native',
  '/games/ferris-wheel'
),
(
  'teen-patti',
  'Teen Patti',
  '🃏',
  'from-red-600 to-red-800',
  'Classic A/B/C card game. Bet on the winning hand and double your diamonds!',
  100, 500000, 33.33, 5, 2,
  true, true, 3,
  '[100, 200, 300, 400, 500]'::jsonb,
  'cards',
  'native',
  '/games/teen-patti'
)
ON CONFLICT (game_id) DO UPDATE SET
  game_name = EXCLUDED.game_name,
  game_emoji = EXCLUDED.game_emoji,
  game_url = EXCLUDED.game_url,
  is_active = EXCLUDED.is_active;

-- Create game_transactions table to track all game wins/losses
CREATE TABLE IF NOT EXISTS game_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  game_id TEXT NOT NULL,
  game_name TEXT,
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('bet', 'win', 'jackpot')),
  amount BIGINT NOT NULL,
  balance_before BIGINT,
  balance_after BIGINT,
  multiplier NUMERIC(10,2),
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_game_transactions_user_id ON game_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_game_transactions_game_id ON game_transactions(game_id);
CREATE INDEX IF NOT EXISTS idx_game_transactions_created_at ON game_transactions(created_at DESC);

-- Enable RLS
ALTER TABLE game_transactions ENABLE ROW LEVEL SECURITY;

-- Users can view their own transactions
CREATE POLICY "Users can view own game transactions"
ON game_transactions FOR SELECT
USING (auth.uid() = user_id);

-- Users can insert their own transactions
CREATE POLICY "Users can insert own game transactions"
ON game_transactions FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Create daily stats aggregation table
CREATE TABLE IF NOT EXISTS game_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id TEXT NOT NULL,
  stat_date DATE NOT NULL DEFAULT CURRENT_DATE,
  total_bets INTEGER DEFAULT 0,
  total_bet_amount BIGINT DEFAULT 0,
  total_wins INTEGER DEFAULT 0,
  total_win_amount BIGINT DEFAULT 0,
  house_profit BIGINT DEFAULT 0,
  unique_players INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(game_id, stat_date)
);

-- Enable RLS for game_stats (admin only read, system write)
ALTER TABLE game_stats ENABLE ROW LEVEL SECURITY;

-- Anyone can read stats
CREATE POLICY "Anyone can view game stats"
ON game_stats FOR SELECT
USING (true);

-- Create function to update game stats on transaction
CREATE OR REPLACE FUNCTION update_game_stats()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO game_stats (game_id, stat_date, total_bets, total_bet_amount, total_wins, total_win_amount, house_profit, unique_players)
  VALUES (
    NEW.game_id,
    CURRENT_DATE,
    CASE WHEN NEW.transaction_type = 'bet' THEN 1 ELSE 0 END,
    CASE WHEN NEW.transaction_type = 'bet' THEN NEW.amount ELSE 0 END,
    CASE WHEN NEW.transaction_type IN ('win', 'jackpot') THEN 1 ELSE 0 END,
    CASE WHEN NEW.transaction_type IN ('win', 'jackpot') THEN NEW.amount ELSE 0 END,
    CASE WHEN NEW.transaction_type = 'bet' THEN NEW.amount 
         WHEN NEW.transaction_type IN ('win', 'jackpot') THEN -NEW.amount 
         ELSE 0 END,
    1
  )
  ON CONFLICT (game_id, stat_date) DO UPDATE SET
    total_bets = game_stats.total_bets + CASE WHEN NEW.transaction_type = 'bet' THEN 1 ELSE 0 END,
    total_bet_amount = game_stats.total_bet_amount + CASE WHEN NEW.transaction_type = 'bet' THEN NEW.amount ELSE 0 END,
    total_wins = game_stats.total_wins + CASE WHEN NEW.transaction_type IN ('win', 'jackpot') THEN 1 ELSE 0 END,
    total_win_amount = game_stats.total_win_amount + CASE WHEN NEW.transaction_type IN ('win', 'jackpot') THEN NEW.amount ELSE 0 END,
    house_profit = game_stats.house_profit + CASE WHEN NEW.transaction_type = 'bet' THEN NEW.amount 
                                                   WHEN NEW.transaction_type IN ('win', 'jackpot') THEN -NEW.amount 
                                                   ELSE 0 END,
    updated_at = now();
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger
DROP TRIGGER IF EXISTS trigger_update_game_stats ON game_transactions;
CREATE TRIGGER trigger_update_game_stats
AFTER INSERT ON game_transactions
FOR EACH ROW
EXECUTE FUNCTION update_game_stats();