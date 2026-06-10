
-- ============ FERRIS WHEEL ============
-- Official multiplier table — server-authoritative, client cannot override.
CREATE OR REPLACE FUNCTION public._ferris_wheel_multiplier(p_slot int)
RETURNS numeric LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_slot
    WHEN 1 THEN 5    -- Grapes
    WHEN 2 THEN 5    -- Carrot
    WHEN 3 THEN 5    -- Strawberry
    WHEN 4 THEN 10   -- Apple
    WHEN 5 THEN 45   -- Pizza
    WHEN 6 THEN 25   -- Burger
    WHEN 7 THEN 15   -- Fries
    WHEN 8 THEN 5    -- Cupcake
    ELSE NULL
  END::numeric;
$$;

CREATE OR REPLACE FUNCTION public.ferris_wheel_play(
  p_bet_amount bigint,
  p_chosen_slot int
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_cur bigint;
  v_after_bet bigint;
  v_final bigint;
  v_winning_slot int;
  v_chosen_mult numeric;
  v_win_amount bigint := 0;
  v_won boolean := false;
  -- Inverse-multiplier weighting (rarer = bigger payout); totals computed below.
  v_weights numeric[] := ARRAY[1/5.0, 1/5.0, 1/5.0, 1/10.0, 1/45.0, 1/25.0, 1/15.0, 1/5.0];
  v_total_w numeric;
  v_r numeric;
  v_cum numeric := 0;
  i int;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Login required');
  END IF;

  IF p_bet_amount IS NULL OR p_bet_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid bet amount');
  END IF;

  IF public._ferris_wheel_multiplier(p_chosen_slot) IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid slot');
  END IF;

  -- Lock wallet
  SELECT coins INTO v_cur FROM profiles WHERE id = v_uid FOR UPDATE;
  IF v_cur IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Profile not found');
  END IF;
  IF v_cur < p_bet_amount THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient diamonds', 'balance', v_cur, 'new_balance', v_cur);
  END IF;

  v_after_bet := v_cur - p_bet_amount;
  PERFORM set_config('app.calling_function',         'ferris_wheel_play', true);
  PERFORM set_config('app.bypass_profile_protection','true',              true);
  UPDATE profiles SET coins = v_after_bet, updated_at = now() WHERE id = v_uid;

  -- Server RNG with house-edge weighting
  v_total_w := 0;
  FOR i IN 1..8 LOOP v_total_w := v_total_w + v_weights[i]; END LOOP;
  v_r := random();
  v_winning_slot := 8;
  FOR i IN 1..8 LOOP
    v_cum := v_cum + (v_weights[i] / v_total_w);
    IF v_r < v_cum THEN v_winning_slot := i; EXIT; END IF;
  END LOOP;

  IF v_winning_slot = p_chosen_slot THEN
    v_chosen_mult := public._ferris_wheel_multiplier(p_chosen_slot);
    v_win_amount := (p_bet_amount::numeric * v_chosen_mult)::bigint;
    v_won := true;
    v_final := v_after_bet + v_win_amount;
    UPDATE profiles SET coins = v_final, updated_at = now() WHERE id = v_uid;
  ELSE
    v_final := v_after_bet;
  END IF;

  BEGIN
    INSERT INTO game_transactions
      (user_id, game_id, game_type, transaction_type,
       amount, bet_amount, win_amount, is_win, multiplier, balance_before, balance_after,
       result_data)
    VALUES
      (v_uid, 'ferris-wheel', 'ferris_wheel',
       CASE WHEN v_won THEN 'win' ELSE 'bet' END,
       CASE WHEN v_won THEN v_win_amount ELSE p_bet_amount END,
       p_bet_amount, v_win_amount, v_won,
       CASE WHEN v_won THEN v_chosen_mult ELSE NULL END,
       v_cur, v_final,
       jsonb_build_object('chosen_slot', p_chosen_slot, 'winning_slot', v_winning_slot));
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  RETURN jsonb_build_object(
    'success', true,
    'winning_slot', v_winning_slot,
    'won', v_won,
    'win_amount', v_win_amount,
    'new_balance', v_final,
    'balance', v_final
  );
END;
$$;

-- ============ TEEN PATTI ============
-- Hand evaluator: returns numeric score (higher = better) following standard Teen Patti ranking.
-- Hands are 3 cards with ranks 1..13 (A=1) and suits.
CREATE OR REPLACE FUNCTION public._teen_patti_score(
  p_ranks int[],
  p_suits text[]
)
RETURNS int
LANGUAGE plpgsql IMMUTABLE
AS $$
DECLARE
  r1 int; r2 int; r3 int;
  is_flush boolean;
  is_seq boolean;
  is_triple boolean;
  is_pair boolean;
  pair_rank int;
BEGIN
  -- sort descending
  SELECT a[1], a[2], a[3] INTO r1, r2, r3
  FROM (SELECT array_agg(x ORDER BY x DESC) AS a FROM unnest(p_ranks) x) s;

  is_flush  := (p_suits[1] = p_suits[2] AND p_suits[2] = p_suits[3]);
  is_seq    := (r1 - r2 = 1 AND r2 - r3 = 1);
  is_triple := (r1 = r2 AND r2 = r3);
  is_pair   := (r1 = r2) OR (r2 = r3) OR (r1 = r3);

  IF is_triple THEN RETURN 600 + r1; END IF;
  IF is_seq AND is_flush THEN RETURN 500 + r1; END IF;
  IF is_seq THEN RETURN 400 + r1; END IF;
  IF is_flush THEN RETURN 300 + r1; END IF;
  IF is_pair THEN
    pair_rank := CASE WHEN r1 = r2 THEN r1 WHEN r2 = r3 THEN r2 ELSE r1 END;
    RETURN 200 + pair_rank;
  END IF;
  RETURN r1;
END;
$$;

CREATE OR REPLACE FUNCTION public.teen_patti_play(
  p_bet_a bigint DEFAULT 0,
  p_bet_b bigint DEFAULT 0,
  p_bet_c bigint DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_cur bigint;
  v_after_bet bigint;
  v_final bigint;
  v_total_bet bigint;
  v_bet_a bigint := GREATEST(0, COALESCE(p_bet_a, 0));
  v_bet_b bigint := GREATEST(0, COALESCE(p_bet_b, 0));
  v_bet_c bigint := GREATEST(0, COALESCE(p_bet_c, 0));
  v_deck_ranks int[];
  v_deck_suits text[];
  v_idx int[];
  v_a_ranks int[]; v_a_suits text[];
  v_b_ranks int[]; v_b_suits text[];
  v_c_ranks int[]; v_c_suits text[];
  v_sa int; v_sb int; v_sc int;
  v_winner text;
  v_bet_on_winner bigint;
  v_win_amount bigint := 0;
  SUITS constant text[] := ARRAY['S','H','D','C'];
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Login required');
  END IF;

  v_total_bet := v_bet_a + v_bet_b + v_bet_c;
  IF v_total_bet <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'No bet placed');
  END IF;

  -- Lock wallet
  SELECT coins INTO v_cur FROM profiles WHERE id = v_uid FOR UPDATE;
  IF v_cur IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Profile not found');
  END IF;
  IF v_cur < v_total_bet THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient diamonds', 'balance', v_cur, 'new_balance', v_cur);
  END IF;

  v_after_bet := v_cur - v_total_bet;
  PERFORM set_config('app.calling_function',         'teen_patti_play', true);
  PERFORM set_config('app.bypass_profile_protection','true',            true);
  UPDATE profiles SET coins = v_after_bet, updated_at = now() WHERE id = v_uid;

  -- Build a 52-card deck (ranks 1..13 × 4 suits) and pick first 9 after shuffle.
  WITH deck AS (
    SELECT (r) AS rank, s AS suit, random() AS o
    FROM generate_series(1, 13) r, unnest(SUITS) s
  ),
  shuffled AS (
    SELECT rank, suit, row_number() OVER (ORDER BY o) AS rn FROM deck
  )
  SELECT
    array_agg(rank ORDER BY rn) FILTER (WHERE rn <= 9),
    array_agg(suit ORDER BY rn) FILTER (WHERE rn <= 9)
  INTO v_deck_ranks, v_deck_suits
  FROM shuffled
  WHERE rn <= 9;

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
  ELSE v_winner := 'C'; v_bet_on_winner := v_bet_c;
  END IF;

  IF v_bet_on_winner > 0 THEN
    v_win_amount := v_bet_on_winner * 2;
    v_final := v_after_bet + v_win_amount;
    UPDATE profiles SET coins = v_final, updated_at = now() WHERE id = v_uid;
  ELSE
    v_final := v_after_bet;
  END IF;

  BEGIN
    INSERT INTO game_transactions
      (user_id, game_id, game_type, transaction_type,
       amount, bet_amount, win_amount, is_win, multiplier, balance_before, balance_after,
       result_data)
    VALUES
      (v_uid, 'teen-patti', 'teen_patti',
       CASE WHEN v_win_amount > 0 THEN 'win' ELSE 'bet' END,
       CASE WHEN v_win_amount > 0 THEN v_win_amount ELSE v_total_bet END,
       v_total_bet, v_win_amount, v_win_amount > 0,
       CASE WHEN v_win_amount > 0 THEN 2 ELSE NULL END,
       v_cur, v_final,
       jsonb_build_object(
         'winner', v_winner,
         'bets', jsonb_build_object('A', v_bet_a, 'B', v_bet_b, 'C', v_bet_c),
         'hands', jsonb_build_object(
           'A', jsonb_build_object('ranks', v_a_ranks, 'suits', v_a_suits, 'score', v_sa),
           'B', jsonb_build_object('ranks', v_b_ranks, 'suits', v_b_suits, 'score', v_sb),
           'C', jsonb_build_object('ranks', v_c_ranks, 'suits', v_c_suits, 'score', v_sc)
         )
       ));
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  RETURN jsonb_build_object(
    'success', true,
    'winner', v_winner,
    'win_amount', v_win_amount,
    'new_balance', v_final,
    'balance', v_final,
    'hands', jsonb_build_object(
      'A', jsonb_build_object('ranks', v_a_ranks, 'suits', v_a_suits, 'score', v_sa),
      'B', jsonb_build_object('ranks', v_b_ranks, 'suits', v_b_suits, 'score', v_sb),
      'C', jsonb_build_object('ranks', v_c_ranks, 'suits', v_c_suits, 'score', v_sc)
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.ferris_wheel_play(bigint, int)              TO authenticated;
GRANT EXECUTE ON FUNCTION public.teen_patti_play(bigint, bigint, bigint)     TO authenticated;
