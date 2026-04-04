-- Fix game_cashout function to properly get game_id from live_game_rounds
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
  v_bet_record RECORD;
BEGIN
  -- Lock and get current coins
  SELECT coins INTO v_current_coins
  FROM profiles
  WHERE id = p_user_id
  FOR UPDATE;

  IF v_current_coins IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'User not found');
  END IF;

  -- Get bet details including game_id from round
  SELECT lgb.*, lgr.game_id 
  INTO v_bet_record
  FROM live_game_bets lgb
  JOIN live_game_rounds lgr ON lgb.round_id = lgr.id
  WHERE lgb.id = p_bet_id AND lgb.user_id = p_user_id;

  IF v_bet_record IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Bet not found');
  END IF;

  -- Check if already processed
  IF v_bet_record.is_processed THEN
    RETURN json_build_object('success', false, 'error', 'Bet already processed');
  END IF;

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

  -- Log the transaction to game_bets
  INSERT INTO game_bets (
    game_id, user_id, bet_amount, bet_type, 
    is_winner, win_amount, multiplier, result
  )
  VALUES (
    v_bet_record.game_id, 
    p_user_id, 
    v_bet_record.bet_amount, 
    'cashout',
    true, 
    p_win_amount, 
    p_multiplier, 
    jsonb_build_object('type', 'cashout', 'multiplier', p_multiplier, 'win_amount', p_win_amount)
  );

  v_result := json_build_object(
    'success', true,
    'new_balance', v_new_coins,
    'win_amount', p_win_amount,
    'multiplier', p_multiplier
  );

  RETURN v_result;
END;
$$;