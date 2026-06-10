
-- 1. Ensure roulette_bets has multiplier column
ALTER TABLE public.roulette_bets ADD COLUMN IF NOT EXISTS multiplier numeric NOT NULL DEFAULT 2;

-- 2. Update session RPC to return session_id + winning_number (keep id for back-compat)
CREATE OR REPLACE FUNCTION public.roulette_get_or_create_session(p_duration_seconds integer DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  active RECORD;
  new_id uuid;
  ends_at timestamptz;
BEGIN
  SELECT * INTO active FROM live_game_rounds
   WHERE game_type = 'roulette' AND status IN ('betting','spinning')
   ORDER BY created_at DESC LIMIT 1;

  IF active IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', true,
      'id', active.id,
      'session_id', active.id,
      'status', active.status,
      'betting_ends_at', active.betting_ends_at,
      'winning_number', active.winning_number,
      'created', false
    );
  END IF;

  ends_at := now() + make_interval(secs => p_duration_seconds);
  INSERT INTO live_game_rounds (game_type, status, betting_ends_at)
  VALUES ('roulette','betting', ends_at)
  RETURNING id INTO new_id;

  RETURN jsonb_build_object(
    'success', true,
    'id', new_id,
    'session_id', new_id,
    'status', 'betting',
    'betting_ends_at', ends_at,
    'winning_number', null,
    'created', true
  );
END;
$$;

-- 3. Authoritative multiplier whitelist + payout decision
CREATE OR REPLACE FUNCTION public._roulette_official_multiplier(p_bet_type text)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_bet_type
    WHEN '0'     THEN 36
    WHEN 'red'   THEN 2
    WHEN 'black' THEN 2
    WHEN 'odd'   THEN 2
    WHEN 'even'  THEN 2
    WHEN '1-12'  THEN 3
    WHEN '13-24' THEN 3
    WHEN '25-36' THEN 3
    ELSE NULL
  END::numeric;
$$;

CREATE OR REPLACE FUNCTION public._roulette_is_winner(p_bet_type text, p_n integer)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_bet_type
    WHEN '0'     THEN p_n = 0
    WHEN '1-12'  THEN p_n BETWEEN 1 AND 12
    WHEN '13-24' THEN p_n BETWEEN 13 AND 24
    WHEN '25-36' THEN p_n BETWEEN 25 AND 36
    WHEN 'red'   THEN p_n = ANY (ARRAY[1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36])
    WHEN 'black' THEN p_n > 0 AND NOT (p_n = ANY (ARRAY[1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]))
    WHEN 'odd'   THEN p_n > 0 AND (p_n % 2 = 1)
    WHEN 'even'  THEN p_n > 0 AND (p_n % 2 = 0)
    ELSE false
  END;
$$;

-- 4. Atomic bet placement: validates phase, validates bet type, deducts coins, inserts bet
CREATE OR REPLACE FUNCTION public.roulette_place_bet(
  p_session_id uuid,
  p_bet_type   text,
  p_amount     bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_session RECORD;
  v_mult numeric;
  v_cur bigint;
  v_new bigint;
  v_bet_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Login required');
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid bet amount');
  END IF;

  v_mult := public._roulette_official_multiplier(p_bet_type);
  IF v_mult IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid bet type');
  END IF;

  -- Lock the round to guarantee phase consistency
  SELECT id, status, betting_ends_at INTO v_session
  FROM live_game_rounds
  WHERE id = p_session_id AND game_type = 'roulette'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Round not found');
  END IF;

  IF v_session.status <> 'betting' OR v_session.betting_ends_at <= now() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Betting is closed');
  END IF;

  -- Lock the player wallet
  SELECT coins INTO v_cur FROM profiles WHERE id = v_uid FOR UPDATE;
  IF v_cur IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Profile not found');
  END IF;
  IF v_cur < p_amount THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient diamonds', 'balance', v_cur, 'new_balance', v_cur);
  END IF;

  v_new := v_cur - p_amount;
  PERFORM set_config('app.calling_function',         'roulette_place_bet', true);
  PERFORM set_config('app.bypass_profile_protection','true',               true);
  UPDATE profiles SET coins = v_new, updated_at = now() WHERE id = v_uid;

  INSERT INTO roulette_bets (session_id, user_id, bet_type, bet_amount, multiplier, is_winner, win_amount)
  VALUES (p_session_id, v_uid, p_bet_type, p_amount::int, v_mult, false, 0)
  RETURNING id INTO v_bet_id;

  BEGIN
    INSERT INTO game_transactions (user_id, game_id, game_type, transaction_type,
      amount, bet_amount, win_amount, is_win, balance_before, balance_after)
    VALUES (v_uid, 'roulette', 'roulette', 'bet',
      p_amount, p_amount, 0, false, v_cur, v_new);
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  RETURN jsonb_build_object(
    'success', true,
    'bet_id', v_bet_id,
    'new_balance', v_new,
    'balance', v_new,
    'multiplier', v_mult
  );
END;
$$;

-- 5. Server RNG spin + atomic settlement (idempotent per round)
CREATE OR REPLACE FUNCTION public.roulette_spin_and_settle(p_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_session RECORD;
  v_winning_number integer;
  v_winning_color  text;
  v_bet RECORD;
  v_payout bigint;
  v_total_pool bigint := 0;
  v_total_payout bigint := 0;
  v_cur bigint;
  v_new bigint;
  RED_NUMBERS constant int[] := ARRAY[1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36];
BEGIN
  SELECT * INTO v_session FROM live_game_rounds
   WHERE id = p_session_id AND game_type = 'roulette'
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Round not found');
  END IF;

  -- Idempotent: if already completed, just return the result
  IF v_session.status = 'completed' AND v_session.winning_number IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', true,
      'already_settled', true,
      'winning_number', v_session.winning_number,
      'winning_color',  v_session.winning_color
    );
  END IF;

  -- Server RNG: 0..36
  v_winning_number := floor(random() * 37)::int;
  v_winning_color :=
    CASE
      WHEN v_winning_number = 0 THEN 'green'
      WHEN v_winning_number = ANY (RED_NUMBERS) THEN 'red'
      ELSE 'black'
    END;

  -- Settle bets and credit winners
  PERFORM set_config('app.calling_function',         'roulette_spin_and_settle', true);
  PERFORM set_config('app.bypass_profile_protection','true',                     true);

  FOR v_bet IN
    SELECT id, user_id, bet_type, bet_amount, multiplier
    FROM roulette_bets
    WHERE session_id = p_session_id
    FOR UPDATE
  LOOP
    v_total_pool := v_total_pool + v_bet.bet_amount;

    IF public._roulette_is_winner(v_bet.bet_type, v_winning_number) THEN
      v_payout := (v_bet.bet_amount::numeric * v_bet.multiplier)::bigint;
      v_total_payout := v_total_payout + v_payout;

      UPDATE roulette_bets
        SET is_winner = true, win_amount = v_payout::int
        WHERE id = v_bet.id;

      SELECT coins INTO v_cur FROM profiles WHERE id = v_bet.user_id FOR UPDATE;
      v_new := COALESCE(v_cur, 0) + v_payout;
      UPDATE profiles SET coins = v_new, updated_at = now() WHERE id = v_bet.user_id;

      BEGIN
        INSERT INTO game_transactions (user_id, game_id, game_type, transaction_type,
          amount, bet_amount, win_amount, is_win, multiplier, balance_before, balance_after,
          result_data)
        VALUES (v_bet.user_id, 'roulette', 'roulette', 'win',
          v_payout, v_bet.bet_amount, v_payout, true, v_bet.multiplier, v_cur, v_new,
          jsonb_build_object('session_id', p_session_id, 'winning_number', v_winning_number, 'bet_type', v_bet.bet_type));
      EXCEPTION WHEN OTHERS THEN NULL;
      END;
    END IF;
  END LOOP;

  UPDATE live_game_rounds
     SET status = 'completed',
         winning_number = v_winning_number,
         winning_color  = v_winning_color,
         total_pool     = v_total_pool::int,
         ended_at       = now()
   WHERE id = p_session_id;

  RETURN jsonb_build_object(
    'success', true,
    'winning_number', v_winning_number,
    'winning_color',  v_winning_color,
    'total_pool',     v_total_pool,
    'total_payout',   v_total_payout
  );
END;
$$;

-- 6. Lock down process_game_win — no user-initiated self-credit anymore.
--    Only service_role, admin user, or active admin session can credit winnings.
CREATE OR REPLACE FUNCTION public.process_game_win(
  p_user_id uuid,
  p_amount bigint,
  p_game_id text,
  p_game_name text,
  p_multiplier numeric DEFAULT NULL,
  p_is_jackpot boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_cur   bigint;
  v_new   bigint;
  v_amt   bigint;
  v_label text;
  v_role  text := COALESCE(auth.role(), '');
BEGIN
  -- Tightened authorization: regular users can NO LONGER credit themselves directly.
  -- Winnings must flow through a server-authoritative game RPC
  -- (e.g. roulette_spin_and_settle) which calls profiles update internally.
  IF v_role <> 'service_role'
     AND NOT public.is_admin(auth.uid())
     AND NOT public.is_active_admin_session() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: use game RPC');
  END IF;

  v_amt := GREATEST(0, COALESCE(p_amount, 0));
  IF v_amt <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid win amount');
  END IF;

  v_label := NULLIF(btrim(COALESCE(p_game_name, '')), '');
  IF v_label IS NULL THEN v_label := NULLIF(btrim(COALESCE(p_game_id, '')), ''); END IF;
  IF v_label IS NULL THEN v_label := 'unknown'; END IF;

  PERFORM set_config('app.calling_function',         'process_game_win', true);
  PERFORM set_config('app.bypass_profile_protection','true',             true);

  SELECT COALESCE(coins, 0) INTO v_cur FROM public.profiles WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'User not found');
  END IF;

  v_new := v_cur + v_amt;
  UPDATE public.profiles SET coins = v_new, updated_at = now() WHERE id = p_user_id;

  BEGIN
    INSERT INTO public.game_transactions
      (user_id, game_id, game_type, transaction_type,
       amount, bet_amount, win_amount, is_win,
       result_data, balance_before, balance_after)
    VALUES
      (p_user_id, COALESCE(p_game_id, v_label), v_label, 'win',
       v_amt, 0, v_amt, true,
       jsonb_build_object('multiplier', p_multiplier, 'is_jackpot', p_is_jackpot),
       v_cur, v_new);
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  RETURN jsonb_build_object('success', true, 'new_balance', v_new, 'balance', v_new, 'added', v_amt);
END;
$$;

GRANT EXECUTE ON FUNCTION public.roulette_place_bet(uuid, text, bigint)        TO authenticated;
GRANT EXECUTE ON FUNCTION public.roulette_spin_and_settle(uuid)                 TO authenticated;
GRANT EXECUTE ON FUNCTION public.roulette_get_or_create_session(integer)        TO authenticated;
