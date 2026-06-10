
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public._secure_random()
RETURNS double precision
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT (
    ((get_byte(b,0)::bigint) << 24) |
    ((get_byte(b,1)::bigint) << 16) |
    ((get_byte(b,2)::bigint) <<  8) |
     (get_byte(b,3)::bigint)
  )::double precision / 4294967296.0
  FROM (SELECT extensions.gen_random_bytes(4) AS b) s;
$$;
REVOKE ALL ON FUNCTION public._secure_random() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._secure_random() TO authenticated, service_role;

-- CR-1: process_game_bet — require auth.uid() = p_user_id
CREATE OR REPLACE FUNCTION public.process_game_bet(
  p_user_id uuid, p_game_id text, p_bet_amount integer,
  p_bet_type text DEFAULT NULL::text, p_bet_value text DEFAULT NULL::text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE user_coins integer; new_bet_id uuid;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> p_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;
  IF p_bet_amount IS NULL OR p_bet_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid bet amount');
  END IF;
  SELECT coins INTO user_coins FROM profiles WHERE id = p_user_id FOR UPDATE;
  IF COALESCE(user_coins, 0) < p_bet_amount THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient coins');
  END IF;
  PERFORM set_config('app.bypass_profile_protection', 'true', true);
  UPDATE profiles SET coins = coins - p_bet_amount WHERE id = p_user_id;
  INSERT INTO game_bets (user_id, bet_amount, bet_type, bet_value, status)
  VALUES (p_user_id, p_bet_amount, p_bet_type, p_bet_value, 'placed')
  RETURNING id INTO new_bet_id;
  RETURN jsonb_build_object('success', true, 'bet_id', new_bet_id, 'new_balance', user_coins - p_bet_amount);
END;
$function$;

-- CR-4 + CR-7: roulette_spin_and_settle
CREATE OR REPLACE FUNCTION public.roulette_spin_and_settle(p_session_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_session RECORD; v_winning_number integer; v_winning_color text;
  v_bet RECORD; v_payout bigint; v_total_pool bigint := 0; v_total_payout bigint := 0;
  v_cur bigint; v_new bigint;
  RED_NUMBERS constant int[] := ARRAY[1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36];
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Login required');
  END IF;
  SELECT * INTO v_session FROM live_game_rounds
   WHERE id = p_session_id AND game_type = 'roulette' FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'Round not found'); END IF;
  IF v_session.status = 'completed' AND v_session.winning_number IS NOT NULL THEN
    RETURN jsonb_build_object('success', true, 'already_settled', true,
      'winning_number', v_session.winning_number, 'winning_color', v_session.winning_color);
  END IF;
  -- CR-4: cannot spin until the betting window has actually ended
  IF v_session.betting_ends_at IS NULL OR v_session.betting_ends_at > now() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Betting still open');
  END IF;
  v_winning_number := floor(public._secure_random() * 37)::int;
  IF v_winning_number > 36 THEN v_winning_number := 36; END IF;
  v_winning_color := CASE
    WHEN v_winning_number = 0 THEN 'green'
    WHEN v_winning_number = ANY (RED_NUMBERS) THEN 'red'
    ELSE 'black' END;
  PERFORM set_config('app.calling_function',         'roulette_spin_and_settle', true);
  PERFORM set_config('app.bypass_profile_protection','true',                     true);
  FOR v_bet IN
    SELECT id, user_id, bet_type, bet_amount, multiplier
    FROM roulette_bets WHERE session_id = p_session_id FOR UPDATE
  LOOP
    v_total_pool := v_total_pool + v_bet.bet_amount;
    IF public._roulette_is_winner(v_bet.bet_type, v_winning_number) THEN
      v_payout := (v_bet.bet_amount::numeric * v_bet.multiplier)::bigint;
      v_total_payout := v_total_payout + v_payout;
      UPDATE roulette_bets SET is_winner = true, win_amount = v_payout::int WHERE id = v_bet.id;
      SELECT coins INTO v_cur FROM profiles WHERE id = v_bet.user_id FOR UPDATE;
      v_new := COALESCE(v_cur, 0) + v_payout;
      UPDATE profiles SET coins = v_new, updated_at = now() WHERE id = v_bet.user_id;
      BEGIN
        INSERT INTO game_transactions (user_id, game_id, game_type, transaction_type,
          amount, bet_amount, win_amount, is_win, multiplier, balance_before, balance_after, result_data)
        VALUES (v_bet.user_id, 'roulette', 'roulette', 'win',
          v_payout, v_bet.bet_amount, v_payout, true, v_bet.multiplier, v_cur, v_new,
          jsonb_build_object('session_id', p_session_id, 'winning_number', v_winning_number, 'bet_type', v_bet.bet_type));
      EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;
  END LOOP;
  UPDATE live_game_rounds
     SET status = 'completed', winning_number = v_winning_number,
         winning_color = v_winning_color, total_pool = v_total_pool::int, ended_at = now()
   WHERE id = p_session_id;
  RETURN jsonb_build_object('success', true, 'winning_number', v_winning_number,
    'winning_color', v_winning_color, 'total_pool', v_total_pool, 'total_payout', v_total_payout);
END;
$function$;

-- CR-7: ferris_wheel_play — secure RNG
CREATE OR REPLACE FUNCTION public.ferris_wheel_play(p_bet_amount bigint, p_chosen_slot integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid(); v_cur bigint; v_after_bet bigint; v_final bigint;
  v_winning_slot int; v_chosen_mult numeric; v_win_amount bigint := 0; v_won boolean := false;
  v_weights numeric[] := ARRAY[1/5.0,1/5.0,1/5.0,1/10.0,1/45.0,1/25.0,1/15.0,1/5.0];
  v_total_w numeric; v_r numeric; v_cum numeric := 0; i int;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Login required'); END IF;
  IF p_bet_amount IS NULL OR p_bet_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid bet amount'); END IF;
  IF public._ferris_wheel_multiplier(p_chosen_slot) IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid slot'); END IF;
  SELECT coins INTO v_cur FROM profiles WHERE id = v_uid FOR UPDATE;
  IF v_cur IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Profile not found'); END IF;
  IF v_cur < p_bet_amount THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient diamonds', 'balance', v_cur, 'new_balance', v_cur); END IF;
  v_after_bet := v_cur - p_bet_amount;
  PERFORM set_config('app.calling_function', 'ferris_wheel_play', true);
  PERFORM set_config('app.bypass_profile_protection','true', true);
  UPDATE profiles SET coins = v_after_bet, updated_at = now() WHERE id = v_uid;
  v_total_w := 0;
  FOR i IN 1..8 LOOP v_total_w := v_total_w + v_weights[i]; END LOOP;
  v_r := public._secure_random();
  v_winning_slot := 8;
  FOR i IN 1..8 LOOP
    v_cum := v_cum + (v_weights[i] / v_total_w);
    IF v_r < v_cum THEN v_winning_slot := i; EXIT; END IF;
  END LOOP;
  IF v_winning_slot = p_chosen_slot THEN
    v_chosen_mult := public._ferris_wheel_multiplier(p_chosen_slot);
    v_win_amount := (p_bet_amount::numeric * v_chosen_mult)::bigint;
    v_won := true; v_final := v_after_bet + v_win_amount;
    UPDATE profiles SET coins = v_final, updated_at = now() WHERE id = v_uid;
  ELSE v_final := v_after_bet; END IF;
  BEGIN
    INSERT INTO game_transactions (user_id, game_id, game_type, transaction_type,
      amount, bet_amount, win_amount, is_win, multiplier, balance_before, balance_after, result_data)
    VALUES (v_uid, 'ferris-wheel', 'ferris_wheel',
      CASE WHEN v_won THEN 'win' ELSE 'bet' END,
      CASE WHEN v_won THEN v_win_amount ELSE p_bet_amount END,
      p_bet_amount, v_win_amount, v_won,
      CASE WHEN v_won THEN v_chosen_mult ELSE NULL END,
      v_cur, v_final,
      jsonb_build_object('chosen_slot', p_chosen_slot, 'winning_slot', v_winning_slot));
  EXCEPTION WHEN OTHERS THEN NULL; END;
  RETURN jsonb_build_object('success', true, 'winning_slot', v_winning_slot,
    'won', v_won, 'win_amount', v_win_amount, 'new_balance', v_final, 'balance', v_final);
END;
$function$;

-- CR-7: teen_patti_play — secure shuffle
CREATE OR REPLACE FUNCTION public.teen_patti_play(p_bet_a bigint DEFAULT 0, p_bet_b bigint DEFAULT 0, p_bet_c bigint DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid(); v_cur bigint; v_after_bet bigint; v_final bigint; v_total_bet bigint;
  v_bet_a bigint := GREATEST(0, COALESCE(p_bet_a, 0));
  v_bet_b bigint := GREATEST(0, COALESCE(p_bet_b, 0));
  v_bet_c bigint := GREATEST(0, COALESCE(p_bet_c, 0));
  v_deck_ranks int[]; v_deck_suits text[];
  v_a_ranks int[]; v_a_suits text[];
  v_b_ranks int[]; v_b_suits text[];
  v_c_ranks int[]; v_c_suits text[];
  v_sa int; v_sb int; v_sc int;
  v_winner text; v_bet_on_winner bigint; v_win_amount bigint := 0;
  SUITS constant text[] := ARRAY['S','H','D','C'];
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Login required'); END IF;
  v_total_bet := v_bet_a + v_bet_b + v_bet_c;
  IF v_total_bet <= 0 THEN RETURN jsonb_build_object('success', false, 'error', 'No bet placed'); END IF;
  SELECT coins INTO v_cur FROM profiles WHERE id = v_uid FOR UPDATE;
  IF v_cur IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Profile not found'); END IF;
  IF v_cur < v_total_bet THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient diamonds', 'balance', v_cur, 'new_balance', v_cur); END IF;
  v_after_bet := v_cur - v_total_bet;
  PERFORM set_config('app.calling_function', 'teen_patti_play', true);
  PERFORM set_config('app.bypass_profile_protection','true', true);
  UPDATE profiles SET coins = v_after_bet, updated_at = now() WHERE id = v_uid;
  WITH deck AS (
    SELECT (r) AS rank, s AS suit, public._secure_random() AS o
    FROM generate_series(1, 13) r, unnest(SUITS) s
  ), shuffled AS (
    SELECT rank, suit, row_number() OVER (ORDER BY o) AS rn FROM deck
  )
  SELECT
    array_agg(rank ORDER BY rn) FILTER (WHERE rn <= 9),
    array_agg(suit ORDER BY rn) FILTER (WHERE rn <= 9)
  INTO v_deck_ranks, v_deck_suits
  FROM shuffled WHERE rn <= 9;
  v_a_ranks := ARRAY[v_deck_ranks[1], v_deck_ranks[2], v_deck_ranks[3]];
  v_a_suits := ARRAY[v_deck_suits[1], v_deck_suits[2], v_deck_suits[3]];
  v_b_ranks := ARRAY[v_deck_ranks[4], v_deck_ranks[5], v_deck_ranks[6]];
  v_b_suits := ARRAY[v_deck_suits[4], v_deck_suits[5], v_deck_suits[6]];
  v_c_ranks := ARRAY[v_deck_ranks[7], v_deck_ranks[8], v_deck_ranks[9]];
  v_c_suits := ARRAY[v_deck_suits[7], v_deck_suits[8], v_deck_suits[9]];
  v_sa := public._teen_patti_score(v_a_ranks, v_a_suits);
  v_sb := public._teen_patti_score(v_b_ranks, v_b_suits);
  v_sc := public._teen_patti_score(v_c_ranks, v_c_suits);
  IF v_sa >= v_sb AND v_sa >= v_sc THEN v_winner := 'A'; v_bet_on_winner := v_bet_a;
  ELSIF v_sb >= v_sa AND v_sb >= v_sc THEN v_winner := 'B'; v_bet_on_winner := v_bet_b;
  ELSE v_winner := 'C'; v_bet_on_winner := v_bet_c; END IF;
  IF v_bet_on_winner > 0 THEN
    v_win_amount := v_bet_on_winner * 2;
    v_final := v_after_bet + v_win_amount;
    UPDATE profiles SET coins = v_final, updated_at = now() WHERE id = v_uid;
  ELSE v_final := v_after_bet; END IF;
  BEGIN
    INSERT INTO game_transactions (user_id, game_id, game_type, transaction_type,
      amount, bet_amount, win_amount, is_win, multiplier, balance_before, balance_after, result_data)
    VALUES (v_uid, 'teen-patti', 'teen_patti',
      CASE WHEN v_win_amount > 0 THEN 'win' ELSE 'bet' END,
      CASE WHEN v_win_amount > 0 THEN v_win_amount ELSE v_total_bet END,
      v_total_bet, v_win_amount, v_win_amount > 0,
      CASE WHEN v_win_amount > 0 THEN 2 ELSE NULL END,
      v_cur, v_final,
      jsonb_build_object('winner', v_winner,
        'bets', jsonb_build_object('A', v_bet_a, 'B', v_bet_b, 'C', v_bet_c),
        'hands', jsonb_build_object(
          'A', jsonb_build_object('ranks', v_a_ranks, 'suits', v_a_suits, 'score', v_sa),
          'B', jsonb_build_object('ranks', v_b_ranks, 'suits', v_b_suits, 'score', v_sb),
          'C', jsonb_build_object('ranks', v_c_ranks, 'suits', v_c_suits, 'score', v_sc))));
  EXCEPTION WHEN OTHERS THEN NULL; END;
  RETURN jsonb_build_object('success', true, 'winner', v_winner,
    'win_amount', v_win_amount, 'new_balance', v_final, 'balance', v_final,
    'hands', jsonb_build_object(
      'A', jsonb_build_object('ranks', v_a_ranks, 'suits', v_a_suits, 'score', v_sa),
      'B', jsonb_build_object('ranks', v_b_ranks, 'suits', v_b_suits, 'score', v_sb),
      'C', jsonb_build_object('ranks', v_c_ranks, 'suits', v_c_suits, 'score', v_sc)));
END;
$function$;

-- CR-6: drop legacy non-locked gift overload
DROP FUNCTION IF EXISTS public.process_gift_transaction(uuid, uuid, uuid, integer, uuid, uuid, uuid, uuid);

-- CR-3: device_tokens — confirm no anon access
REVOKE ALL ON public.device_tokens FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.device_tokens TO authenticated;
GRANT ALL ON public.device_tokens TO service_role;

-- CR-8: livekit_room_events — service_role only
ALTER TABLE public.livekit_room_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.livekit_room_events FROM anon, authenticated;
GRANT ALL ON public.livekit_room_events TO service_role;
