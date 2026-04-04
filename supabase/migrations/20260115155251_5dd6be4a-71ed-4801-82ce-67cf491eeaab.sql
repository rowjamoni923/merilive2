-- Update create_live_game_round function to use 30 seconds as default
CREATE OR REPLACE FUNCTION create_live_game_round(
  p_game_id TEXT,
  p_room_id UUID DEFAULT NULL,
  p_betting_seconds INTEGER DEFAULT 30
) RETURNS UUID AS $$
DECLARE
  v_round_id UUID;
  v_last_round INTEGER;
BEGIN
  -- Get last round number for this game (global games have null room_id)
  SELECT COALESCE(MAX(round_number), 0) INTO v_last_round 
  FROM live_game_rounds 
  WHERE game_id = p_game_id 
    AND ((room_id IS NULL AND p_room_id IS NULL) OR room_id = p_room_id);
  
  -- Insert new round
  INSERT INTO live_game_rounds (game_id, room_id, round_number, betting_end_at)
  VALUES (p_game_id, p_room_id, v_last_round + 1, now() + (p_betting_seconds || ' seconds')::INTERVAL)
  RETURNING id INTO v_round_id;
  
  RETURN v_round_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Add game_settings for live games if not exists
INSERT INTO game_settings (game_id, game_name, game_emoji, game_color, description, min_bet, max_bet, win_probability, house_edge, max_multiplier, is_active, display_order)
VALUES 
  ('lucky28', 'Lucky 28', '🎲', 'from-purple-500 to-pink-500', 'Predict if the total will be Big or Small', 10, 100000, 48.00, 4.00, 2.00, true, 1)
ON CONFLICT (game_id) DO UPDATE SET
  game_name = EXCLUDED.game_name,
  game_emoji = EXCLUDED.game_emoji,
  is_active = true;

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_live_game_rounds_game_status ON live_game_rounds(game_id, status);
CREATE INDEX IF NOT EXISTS idx_live_game_rounds_global ON live_game_rounds(game_id) WHERE room_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_live_game_bets_round ON live_game_bets(round_id);