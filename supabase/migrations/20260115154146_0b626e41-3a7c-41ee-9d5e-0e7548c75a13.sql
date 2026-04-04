-- Live Game Rounds Table for multiplayer betting
CREATE TABLE public.live_game_rounds (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  game_id TEXT NOT NULL,
  room_id UUID REFERENCES public.party_rooms(id) ON DELETE SET NULL,
  round_number INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'betting', -- betting, playing, completed
  betting_end_at TIMESTAMP WITH TIME ZONE NOT NULL,
  game_start_at TIMESTAMP WITH TIME ZONE,
  game_end_at TIMESTAMP WITH TIME ZONE,
  result JSONB DEFAULT '{}',
  total_bets INTEGER DEFAULT 0,
  total_bet_amount INTEGER DEFAULT 0,
  total_players INTEGER DEFAULT 0,
  winning_value TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.live_game_rounds ENABLE ROW LEVEL SECURITY;

-- Everyone can view live rounds
CREATE POLICY "Anyone can view live game rounds" 
ON public.live_game_rounds 
FOR SELECT 
USING (true);

-- Only system can insert/update
CREATE POLICY "System can manage live game rounds" 
ON public.live_game_rounds 
FOR ALL 
USING (true);

-- Live Game Bets for round-based betting
CREATE TABLE public.live_game_bets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  round_id UUID NOT NULL REFERENCES public.live_game_rounds(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id),
  bet_amount INTEGER NOT NULL,
  bet_type TEXT,
  bet_value TEXT,
  win_amount INTEGER DEFAULT 0,
  multiplier DECIMAL(10,2) DEFAULT 0,
  is_winner BOOLEAN DEFAULT FALSE,
  is_processed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(round_id, user_id, bet_type, bet_value)
);

-- Enable RLS
ALTER TABLE public.live_game_bets ENABLE ROW LEVEL SECURITY;

-- Users can view all bets in a round
CREATE POLICY "Users can view live game bets" 
ON public.live_game_bets 
FOR SELECT 
USING (true);

-- Users can place their own bets
CREATE POLICY "Users can place live game bets" 
ON public.live_game_bets 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

-- Enable realtime for live rounds
ALTER PUBLICATION supabase_realtime ADD TABLE live_game_rounds;
ALTER PUBLICATION supabase_realtime ADD TABLE live_game_bets;

-- Function to place a live game bet
CREATE OR REPLACE FUNCTION place_live_game_bet(
  p_round_id UUID,
  p_user_id UUID,
  p_bet_amount INTEGER,
  p_bet_type TEXT DEFAULT NULL,
  p_bet_value TEXT DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_round RECORD;
  v_user_coins INTEGER;
  v_existing_bet UUID;
BEGIN
  -- Get round info
  SELECT * INTO v_round FROM live_game_rounds WHERE id = p_round_id;
  
  IF v_round IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Round not found');
  END IF;
  
  -- Check if betting is still open
  IF v_round.status != 'betting' OR now() > v_round.betting_end_at THEN
    RETURN jsonb_build_object('success', false, 'error', 'Betting is closed');
  END IF;
  
  -- Check user balance
  SELECT coins INTO v_user_coins FROM profiles WHERE id = p_user_id;
  IF v_user_coins < p_bet_amount THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient balance');
  END IF;
  
  -- Check if bet already exists
  SELECT id INTO v_existing_bet FROM live_game_bets 
  WHERE round_id = p_round_id 
    AND user_id = p_user_id 
    AND COALESCE(bet_type, '') = COALESCE(p_bet_type, '')
    AND COALESCE(bet_value, '') = COALESCE(p_bet_value, '');
  
  IF v_existing_bet IS NOT NULL THEN
    -- Update existing bet
    UPDATE live_game_bets 
    SET bet_amount = bet_amount + p_bet_amount
    WHERE id = v_existing_bet;
  ELSE
    -- Insert new bet
    INSERT INTO live_game_bets (round_id, user_id, bet_amount, bet_type, bet_value)
    VALUES (p_round_id, p_user_id, p_bet_amount, p_bet_type, p_bet_value);
    
    -- Update round stats
    UPDATE live_game_rounds 
    SET total_players = total_players + 1
    WHERE id = p_round_id;
  END IF;
  
  -- Deduct coins
  UPDATE profiles SET coins = coins - p_bet_amount WHERE id = p_user_id;
  
  -- Update round totals
  UPDATE live_game_rounds 
  SET total_bets = total_bets + 1,
      total_bet_amount = total_bet_amount + p_bet_amount
  WHERE id = p_round_id;
  
  RETURN jsonb_build_object(
    'success', true,
    'bet_amount', p_bet_amount,
    'new_balance', v_user_coins - p_bet_amount
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to process round results
CREATE OR REPLACE FUNCTION process_live_game_round(
  p_round_id UUID,
  p_winning_value TEXT,
  p_result JSONB DEFAULT '{}'
) RETURNS JSONB AS $$
DECLARE
  v_round RECORD;
  v_game RECORD;
  v_bet RECORD;
  v_multiplier DECIMAL;
  v_win_amount INTEGER;
  v_total_winners INTEGER := 0;
  v_total_win_amount INTEGER := 0;
BEGIN
  -- Get round info
  SELECT * INTO v_round FROM live_game_rounds WHERE id = p_round_id;
  
  IF v_round IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Round not found');
  END IF;
  
  -- Get game settings
  SELECT * INTO v_game FROM game_settings WHERE game_id = v_round.game_id;
  
  -- Mark round as playing
  UPDATE live_game_rounds 
  SET status = 'playing', 
      game_start_at = now(),
      winning_value = p_winning_value,
      result = p_result
  WHERE id = p_round_id;
  
  -- Process each bet
  FOR v_bet IN SELECT * FROM live_game_bets WHERE round_id = p_round_id AND is_processed = false
  LOOP
    -- Check if bet wins based on game logic
    IF v_bet.bet_value = p_winning_value OR 
       (v_round.game_id = 'crash' AND v_bet.bet_value IS NULL) OR
       (v_round.game_id = 'wheel' AND v_bet.bet_value IS NULL) OR
       (v_round.game_id = 'slots' AND v_bet.bet_value IS NULL) THEN
      
      -- Calculate winnings
      v_multiplier := COALESCE((p_result->>'multiplier')::DECIMAL, v_game.max_multiplier / 2);
      v_win_amount := FLOOR(v_bet.bet_amount * v_multiplier);
      
      -- Update bet record
      UPDATE live_game_bets 
      SET is_winner = true,
          multiplier = v_multiplier,
          win_amount = v_win_amount,
          is_processed = true
      WHERE id = v_bet.id;
      
      -- Credit winnings
      UPDATE profiles SET coins = coins + v_win_amount WHERE id = v_bet.user_id;
      
      v_total_winners := v_total_winners + 1;
      v_total_win_amount := v_total_win_amount + v_win_amount;
    ELSE
      -- Mark as processed (lost)
      UPDATE live_game_bets 
      SET is_processed = true
      WHERE id = v_bet.id;
    END IF;
  END LOOP;
  
  -- Mark round as completed
  UPDATE live_game_rounds 
  SET status = 'completed', 
      game_end_at = now()
  WHERE id = p_round_id;
  
  RETURN jsonb_build_object(
    'success', true,
    'total_winners', v_total_winners,
    'total_win_amount', v_total_win_amount,
    'winning_value', p_winning_value
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to create a new round
CREATE OR REPLACE FUNCTION create_live_game_round(
  p_game_id TEXT,
  p_room_id UUID DEFAULT NULL,
  p_betting_seconds INTEGER DEFAULT 15
) RETURNS UUID AS $$
DECLARE
  v_round_id UUID;
  v_last_round INTEGER;
BEGIN
  -- Get last round number
  SELECT COALESCE(MAX(round_number), 0) INTO v_last_round 
  FROM live_game_rounds 
  WHERE game_id = p_game_id AND (room_id = p_room_id OR (room_id IS NULL AND p_room_id IS NULL));
  
  -- Insert new round
  INSERT INTO live_game_rounds (game_id, room_id, round_number, betting_end_at)
  VALUES (p_game_id, p_room_id, v_last_round + 1, now() + (p_betting_seconds || ' seconds')::INTERVAL)
  RETURNING id INTO v_round_id;
  
  RETURN v_round_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;