-- Enhanced process_live_game_round with admin-controlled win probability
CREATE OR REPLACE FUNCTION public.process_live_game_round(
  p_round_id UUID,
  p_winning_value TEXT,
  p_result JSONB DEFAULT '{}'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_round RECORD;
  v_game RECORD;
  v_bet RECORD;
  v_multiplier DECIMAL;
  v_win_amount INTEGER;
  v_total_winners INTEGER := 0;
  v_total_win_amount INTEGER := 0;
  v_is_winner BOOLEAN;
BEGIN
  -- Get round info
  SELECT * INTO v_round FROM live_game_rounds WHERE id = p_round_id;
  
  IF v_round IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Round not found');
  END IF;
  
  -- Already processed?
  IF v_round.status = 'completed' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Round already completed');
  END IF;
  
  -- Get game settings for multiplier
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
    -- Determine if bet wins based on bet_value matching winning_value
    -- For Lucky28: small/big, even/odd matching
    v_is_winner := false;
    
    -- Direct match (e.g., user bet 'big' and winning_value is 'big')
    IF v_bet.bet_value = p_winning_value THEN
      v_is_winner := true;
    -- For even/odd with small/big result, check the total
    ELSIF v_bet.bet_value IN ('even', 'odd') THEN
      -- Check if the result contains isOdd flag
      IF v_bet.bet_value = 'odd' AND (p_result->>'isOdd')::BOOLEAN = true THEN
        v_is_winner := true;
      ELSIF v_bet.bet_value = 'even' AND (p_result->>'isOdd')::BOOLEAN = false THEN
        v_is_winner := true;
      END IF;
    END IF;
    
    IF v_is_winner THEN
      -- Calculate winnings (2x multiplier for these games)
      v_multiplier := COALESCE((p_result->>'multiplier')::DECIMAL, 2);
      v_win_amount := FLOOR(v_bet.bet_amount * v_multiplier);
      
      -- Update bet record
      UPDATE live_game_bets 
      SET is_winner = true,
          multiplier = v_multiplier,
          win_amount = v_win_amount,
          is_processed = true
      WHERE id = v_bet.id;
      
      -- Credit winnings to user
      UPDATE profiles SET coins = coins + v_win_amount WHERE id = v_bet.user_id;
      
      v_total_winners := v_total_winners + 1;
      v_total_win_amount := v_total_win_amount + v_win_amount;
    ELSE
      -- Mark as processed (lost) - coins already deducted when bet placed
      UPDATE live_game_bets 
      SET is_winner = false,
          is_processed = true
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
    'winning_value', p_winning_value,
    'result', p_result
  );
END;
$$;

-- Function to auto-run game (calculate result based on admin win probability)
CREATE OR REPLACE FUNCTION public.auto_process_live_game()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_round RECORD;
  v_game RECORD;
  v_win_probability DECIMAL;
  v_dice1 INTEGER;
  v_dice2 INTEGER;
  v_dice3 INTEGER;
  v_total INTEGER;
  v_winning_value TEXT;
  v_is_big BOOLEAN;
  v_is_odd BOOLEAN;
  v_result JSONB;
  v_processed_count INTEGER := 0;
BEGIN
  -- Process all betting rounds that have expired
  FOR v_round IN 
    SELECT * FROM live_game_rounds 
    WHERE status = 'betting' 
    AND betting_end_at <= now()
    ORDER BY created_at
  LOOP
    -- Get game settings for win probability
    SELECT * INTO v_game FROM game_settings WHERE game_id = v_round.game_id;
    v_win_probability := COALESCE(v_game.win_probability, 0.45); -- Default 45% win rate
    
    -- For Lucky28 game: generate dice result with probability control
    -- We analyze what most players bet on and slightly favor house
    DECLARE
      v_small_bets INTEGER := 0;
      v_big_bets INTEGER := 0;
      v_target_result TEXT;
    BEGIN
      -- Count bets for each side
      SELECT 
        COALESCE(SUM(CASE WHEN bet_value = 'small' THEN bet_amount ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN bet_value = 'big' THEN bet_amount ELSE 0 END), 0)
      INTO v_small_bets, v_big_bets
      FROM live_game_bets WHERE round_id = v_round.id;
      
      -- Determine target result based on house edge
      -- If more bet on big, result tends to be small (within probability bounds)
      IF random() < (1 - v_win_probability) THEN
        -- House wins - result goes opposite to major bets
        IF v_big_bets > v_small_bets THEN
          v_target_result := 'small';
        ELSE
          v_target_result := 'big';
        END IF;
      ELSE
        -- Players win
        IF v_big_bets > v_small_bets THEN
          v_target_result := 'big';
        ELSE
          v_target_result := 'small';
        END IF;
      END IF;
      
      -- Generate dice that match target
      IF v_target_result = 'small' THEN
        -- Generate total between 3-10
        v_total := 3 + floor(random() * 8)::INTEGER;
      ELSE
        -- Generate total between 11-18
        v_total := 11 + floor(random() * 8)::INTEGER;
      END IF;
      
      -- Generate individual dice that sum to total
      v_dice1 := GREATEST(1, LEAST(6, floor(random() * 6 + 1)::INTEGER));
      v_dice2 := GREATEST(1, LEAST(6, floor(random() * 6 + 1)::INTEGER));
      v_dice3 := v_total - v_dice1 - v_dice2;
      
      -- Adjust if dice3 is out of range
      WHILE v_dice3 < 1 OR v_dice3 > 6 LOOP
        v_dice1 := GREATEST(1, LEAST(6, floor(random() * 6 + 1)::INTEGER));
        v_dice2 := GREATEST(1, LEAST(6, floor(random() * 6 + 1)::INTEGER));
        v_dice3 := v_total - v_dice1 - v_dice2;
        
        -- Safety check - if can't find valid combo, just use random
        IF v_dice3 < 1 OR v_dice3 > 6 THEN
          v_dice1 := floor(random() * 6 + 1)::INTEGER;
          v_dice2 := floor(random() * 6 + 1)::INTEGER;
          v_dice3 := floor(random() * 6 + 1)::INTEGER;
          v_total := v_dice1 + v_dice2 + v_dice3;
          EXIT;
        END IF;
      END LOOP;
    END;
    
    v_is_big := v_total >= 11;
    v_is_odd := v_total % 2 = 1;
    v_winning_value := CASE WHEN v_is_big THEN 'big' ELSE 'small' END;
    
    v_result := jsonb_build_object(
      'dice', jsonb_build_array(v_dice1, v_dice2, v_dice3),
      'total', v_total,
      'isBig', v_is_big,
      'isOdd', v_is_odd,
      'multiplier', 2
    );
    
    -- Process the round
    PERFORM process_live_game_round(v_round.id, v_winning_value, v_result);
    v_processed_count := v_processed_count + 1;
    
    -- Create next round automatically
    PERFORM create_live_game_round(v_round.game_id, NULL, 30);
  END LOOP;
  
  RETURN jsonb_build_object('processed_rounds', v_processed_count);
END;
$$;

-- Enable realtime for live_game_bets and profiles coins
ALTER TABLE live_game_bets REPLICA IDENTITY FULL;
ALTER TABLE live_game_rounds REPLICA IDENTITY FULL;

-- Add to realtime publication if not already
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'live_game_bets'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE live_game_bets;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'live_game_rounds'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE live_game_rounds;
  END IF;
END $$;

-- Add win_probability column to game_settings if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'game_settings' AND column_name = 'win_probability'
  ) THEN
    ALTER TABLE game_settings ADD COLUMN win_probability DECIMAL DEFAULT 0.45;
  END IF;
END $$;

-- Update lucky28 game with default win probability
UPDATE game_settings 
SET win_probability = 0.45 
WHERE game_id = 'lucky28' AND win_probability IS NULL;