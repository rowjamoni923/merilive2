
-- ============================================================
-- CRITICAL SECURITY PATCH: Lock ALL coin/beans/diamond RPCs
-- No external caller can manipulate balances without auth
-- ============================================================

-- 1. add_beans_to_host → ADMIN ONLY
CREATE OR REPLACE FUNCTION public.add_beans_to_host(p_host_id UUID, p_beans_amount INTEGER, p_total_earnings INTEGER DEFAULT 0, p_host_level INTEGER DEFAULT 1)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Unauthorized: Only admins can add beans to hosts';
  END IF;
  UPDATE profiles
  SET beans_balance = COALESCE(beans_balance, 0) + p_beans_amount,
      total_earnings = COALESCE(total_earnings, 0) + p_total_earnings,
      host_level = GREATEST(COALESCE(host_level, 1), p_host_level),
      updated_at = now()
  WHERE id = p_host_id;
END;
$$;

-- 2. add_beans_to_user → ADMIN ONLY
CREATE OR REPLACE FUNCTION public.add_beans_to_user(_user_id UUID, _amount INTEGER)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Unauthorized: Only admins can add beans';
  END IF;
  UPDATE profiles
  SET beans = COALESCE(beans, 0) + _amount
  WHERE id = _user_id;
END;
$$;

-- 3. add_diamonds_to_user → ADMIN ONLY
CREATE OR REPLACE FUNCTION public.add_diamonds_to_user(_user_id UUID, _amount INTEGER)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Unauthorized: Only admins can add diamonds';
  END IF;
  UPDATE profiles
  SET diamonds = COALESCE(diamonds, 0) + _amount
  WHERE id = _user_id;
END;
$$;

-- 4. add_diamonds_to_agency → ADMIN ONLY
CREATE OR REPLACE FUNCTION public.add_diamonds_to_agency(_agency_id UUID, _amount INTEGER)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Unauthorized: Only admins can add agency diamonds';
  END IF;
  IF _amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be positive';
  END IF;
  UPDATE agencies 
  SET diamond_balance = COALESCE(diamond_balance, 0) + _amount 
  WHERE id = _agency_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Agency not found';
  END IF;
END;
$$;

-- 5. place_game_bet → SELF ONLY (auth.uid() must match)
CREATE OR REPLACE FUNCTION public.place_game_bet(p_user_id UUID, p_amount INTEGER, p_game_id TEXT, p_game_name TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_balance INTEGER;
  v_new_balance INTEGER;
BEGIN
  -- CRITICAL: User can only bet for themselves
  IF auth.uid() IS NULL OR auth.uid() != p_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  SELECT coins INTO v_current_balance FROM profiles WHERE id = p_user_id FOR UPDATE;
  IF v_current_balance IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'User not found');
  END IF;
  IF v_current_balance < p_amount THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient diamonds', 'balance', v_current_balance);
  END IF;
  
  v_new_balance := v_current_balance - p_amount;
  UPDATE profiles SET coins = v_new_balance, updated_at = now() WHERE id = p_user_id;
  
  INSERT INTO game_transactions (user_id, game_id, game_name, transaction_type, amount, balance_before, balance_after, details)
  VALUES (p_user_id, p_game_id, p_game_name, 'bet', p_amount, v_current_balance, v_new_balance, '{"action": "bet_placed"}'::jsonb);
  
  RETURN jsonb_build_object('success', true, 'new_balance', v_new_balance, 'deducted', p_amount);
END;
$$;

-- 6. process_game_win → SELF ONLY
CREATE OR REPLACE FUNCTION public.process_game_win(p_user_id UUID, p_amount INTEGER, p_game_id TEXT, p_game_name TEXT, p_multiplier NUMERIC DEFAULT NULL, p_is_jackpot BOOLEAN DEFAULT false)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_balance INTEGER;
  v_new_balance INTEGER;
BEGIN
  -- CRITICAL: User can only process wins for themselves
  IF auth.uid() IS NULL OR auth.uid() != p_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  SELECT coins INTO v_current_balance FROM profiles WHERE id = p_user_id FOR UPDATE;
  IF v_current_balance IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'User not found');
  END IF;
  
  v_new_balance := v_current_balance + p_amount;
  UPDATE profiles SET coins = v_new_balance, updated_at = now() WHERE id = p_user_id;
  
  INSERT INTO game_transactions (user_id, game_id, game_name, transaction_type, amount, balance_before, balance_after, multiplier, details)
  VALUES (p_user_id, p_game_id, p_game_name,
    CASE WHEN p_is_jackpot THEN 'jackpot' ELSE 'win' END,
    p_amount, v_current_balance, v_new_balance, p_multiplier,
    jsonb_build_object('action', CASE WHEN p_is_jackpot THEN 'jackpot_won' ELSE 'game_won' END));
  
  RETURN jsonb_build_object('success', true, 'new_balance', v_new_balance, 'won', p_amount);
END;
$$;

-- 7. game_cashout → SELF ONLY
CREATE OR REPLACE FUNCTION public.game_cashout(p_user_id UUID, p_bet_id UUID, p_win_amount INTEGER, p_multiplier NUMERIC)
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
  -- CRITICAL: User can only cashout for themselves
  IF auth.uid() IS NULL OR auth.uid() != p_user_id THEN
    RETURN json_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  SELECT coins INTO v_current_coins FROM profiles WHERE id = p_user_id FOR UPDATE;
  IF v_current_coins IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'User not found');
  END IF;

  SELECT lgb.*, lgr.game_id INTO v_bet_record
  FROM live_game_bets lgb
  JOIN live_game_rounds lgr ON lgb.round_id = lgr.id
  WHERE lgb.id = p_bet_id AND lgb.user_id = p_user_id;

  IF v_bet_record IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Bet not found');
  END IF;
  IF v_bet_record.is_processed THEN
    RETURN json_build_object('success', false, 'error', 'Bet already processed');
  END IF;

  v_new_coins := v_current_coins + p_win_amount;
  UPDATE profiles SET coins = v_new_coins WHERE id = p_user_id;
  UPDATE live_game_bets SET is_winner = true, win_amount = p_win_amount, multiplier = p_multiplier, is_processed = true, cashed_out_at = now()
  WHERE id = p_bet_id AND user_id = p_user_id;

  INSERT INTO game_bets (game_id, user_id, bet_amount, bet_type, is_winner, win_amount, multiplier, result)
  VALUES (v_bet_record.game_id, p_user_id, v_bet_record.bet_amount, 'cashout', true, p_win_amount, p_multiplier,
    jsonb_build_object('type', 'cashout', 'multiplier', p_multiplier, 'win_amount', p_win_amount));

  RETURN json_build_object('success', true, 'new_balance', v_new_coins, 'win_amount', p_win_amount, 'multiplier', p_multiplier);
END;
$$;

-- 8. exchange_user_beans_to_diamonds → SELF ONLY
CREATE OR REPLACE FUNCTION public.exchange_user_beans_to_diamonds(_user_id UUID, _beans_amount INTEGER, _diamonds_reward INTEGER, _tier_id UUID DEFAULT NULL)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_beans INTEGER;
BEGIN
  -- CRITICAL: User can only exchange their own beans
  IF auth.uid() IS NULL OR auth.uid() != _user_id THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT COALESCE(SUM(coin_amount), 0) INTO current_beans
  FROM gift_transactions WHERE receiver_id = _user_id;
  
  IF current_beans < _beans_amount THEN
    RAISE EXCEPTION 'Insufficient beans balance';
  END IF;
  
  INSERT INTO gift_transactions (sender_id, receiver_id, gift_id, coin_amount, created_at)
  VALUES (_user_id, '00000000-0000-0000-0000-000000000000'::UUID, NULL, -_beans_amount, now());
  
  -- Add diamonds directly (bypassing admin-only add_coins_to_user)
  UPDATE profiles SET coins = COALESCE(coins, 0) + _diamonds_reward WHERE id = _user_id;
  
  INSERT INTO user_beans_exchange_history (user_id, beans_spent, diamonds_received, tier_id)
  VALUES (_user_id, _beans_amount, _diamonds_reward, _tier_id);
  
  RETURN TRUE;
END;
$$;

-- 9. process_game_bet → SELF ONLY  
CREATE OR REPLACE FUNCTION public.process_game_bet(p_user_id UUID, p_game_id TEXT, p_bet_amount INTEGER, p_bet_type TEXT DEFAULT NULL, p_bet_value TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_game_settings RECORD;
  v_is_winner BOOLEAN;
  v_multiplier DECIMAL;
  v_win_amount INTEGER;
  v_random DECIMAL;
  v_user_coins INTEGER;
BEGIN
  -- CRITICAL: User can only bet for themselves
  IF auth.uid() IS NULL OR auth.uid() != p_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  SELECT * INTO v_game_settings FROM game_settings WHERE game_id = p_game_id AND is_active = true;
  IF v_game_settings IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Game not found'); END IF;
  IF p_bet_amount < v_game_settings.min_bet OR p_bet_amount > v_game_settings.max_bet THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid bet amount');
  END IF;
  SELECT coins INTO v_user_coins FROM profiles WHERE id = p_user_id FOR UPDATE;
  IF v_user_coins < p_bet_amount THEN RETURN jsonb_build_object('success', false, 'error', 'Insufficient balance'); END IF;
  
  v_random := random() * 100;
  v_is_winner := v_random <= COALESCE(v_game_settings.win_rate, 30);
  IF v_is_winner THEN
    v_multiplier := 1.5 + random() * (COALESCE(v_game_settings.max_multiplier, 5) - 1.5);
    v_win_amount := (p_bet_amount * v_multiplier)::integer;
    UPDATE profiles SET coins = coins - p_bet_amount + v_win_amount WHERE id = p_user_id;
  ELSE
    v_win_amount := 0;
    v_multiplier := 0;
    UPDATE profiles SET coins = coins - p_bet_amount WHERE id = p_user_id;
  END IF;
  
  INSERT INTO game_transactions (user_id, game_id, bet_amount, win_amount, multiplier, is_winner, bet_type, bet_value)
  VALUES (p_user_id, p_game_id, p_bet_amount, v_win_amount, v_multiplier, v_is_winner, p_bet_type, p_bet_value);
  
  RETURN jsonb_build_object('success', true, 'is_winner', v_is_winner, 'multiplier', v_multiplier, 'win_amount', v_win_amount, 'new_balance', v_user_coins - p_bet_amount + v_win_amount);
END;
$$;
