-- Phase 4 — Game polish
-- M-1: Teen Patti tie-breaker — current code uses cascading >= which makes
-- hand A always win 3-way ties (and A wins all A=B and A=C ties). Replace
-- with cryptographic random pick among tied top-scoring hands.

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
  v_a_ranks int[]; v_a_suits text[];
  v_b_ranks int[]; v_b_suits text[];
  v_c_ranks int[]; v_c_suits text[];
  v_sa int; v_sb int; v_sc int;
  v_max int;
  v_candidates text[];
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

  WITH deck AS (
    SELECT (r) AS rank, s AS suit, public._secure_random() AS o
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

  -- M-1: fair random tie-break among top-scoring hands
  v_max := GREATEST(v_sa, v_sb, v_sc);
  v_candidates := ARRAY[]::text[];
  IF v_sa = v_max THEN v_candidates := array_append(v_candidates, 'A'); END IF;
  IF v_sb = v_max THEN v_candidates := array_append(v_candidates, 'B'); END IF;
  IF v_sc = v_max THEN v_candidates := array_append(v_candidates, 'C'); END IF;
  v_winner := v_candidates[1 + floor(public._secure_random() * array_length(v_candidates,1))::int];

  v_bet_on_winner := CASE v_winner WHEN 'A' THEN v_bet_a WHEN 'B' THEN v_bet_b ELSE v_bet_c END;

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
         'tie_count', array_length(v_candidates,1),
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

GRANT EXECUTE ON FUNCTION public.teen_patti_play(bigint, bigint, bigint) TO authenticated;