-- DU-2 Batch 3: retarget 18 game/shop RPCs to write diamonds (soak-safe under trg_du2_sync_spend_wallet)

BEGIN;

-- === distribute_pk_rewards(p_competition_id uuid) ===

CREATE OR REPLACE FUNCTION public.distribute_pk_rewards(p_competition_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_comp record;
  v_count integer := 0;
  v_participant record;
  v_reward record;
  v_rank integer := 0;
  v_inserted boolean;
  v_is_service boolean := COALESCE(current_setting('request.jwt.claim.role', true), '') = 'service_role';
BEGIN
  IF NOT v_is_service THEN
    IF NOT public.is_active_admin_session() THEN
      RAISE EXCEPTION 'Unauthorized: admin or service role required';
    END IF;
    IF NOT public.admin_has_any_section_permission(
      ARRAY['leaderboard','streams','moderation']::text[], true) THEN
      RAISE EXCEPTION 'forbidden_section';
    END IF;
  END IF;

  SELECT * INTO v_comp FROM public.pk_competitions WHERE id = p_competition_id;
  IF v_comp IS NULL OR v_comp.status = 'cancelled' THEN RETURN 0; END IF;

  PERFORM set_config('app.bypass_profile_protection', 'true', true);
  PERFORM set_config('app.pk_participants_internal', 'true', true);

  FOR v_participant IN (
    SELECT * FROM public.pk_participants
    WHERE competition_id = p_competition_id AND score > 0
    ORDER BY score DESC, updated_at ASC
    LIMIT 50
  ) LOOP
    v_rank := v_rank + 1;
    UPDATE public.pk_participants SET rank_position = v_rank WHERE id = v_participant.id;

    SELECT * INTO v_reward FROM public.pk_competition_rewards
    WHERE competition_id = p_competition_id AND is_active = true
      AND v_rank >= rank_from AND v_rank <= rank_to LIMIT 1;

    IF v_reward IS NOT NULL THEN
      v_inserted := false;
      INSERT INTO public.pk_reward_history (competition_id, user_id, rank_position, reward_diamonds, reward_beans, reward_coins)
      VALUES (p_competition_id, v_participant.user_id, v_rank,
              COALESCE(v_reward.reward_diamonds, 0), COALESCE(v_reward.reward_beans, 0), COALESCE(v_reward.reward_coins, 0))
      ON CONFLICT (competition_id, user_id) DO NOTHING
      RETURNING true INTO v_inserted;

      IF COALESCE(v_inserted, false) THEN
        IF COALESCE(v_reward.reward_beans, 0) > 0 THEN
          UPDATE public.profiles
          SET beans = COALESCE(beans, 0) + v_reward.reward_beans,
              beans_balance = COALESCE(beans_balance, 0) + v_reward.reward_beans
          WHERE id = v_participant.user_id;
        END IF;
        IF COALESCE(v_reward.reward_diamonds, 0) > 0 THEN
          UPDATE public.profiles SET diamonds = COALESCE(diamonds, 0) + v_reward.reward_diamonds WHERE id = v_participant.user_id;
        END IF;
        IF COALESCE(v_reward.reward_coins, 0) > 0 THEN
          UPDATE public.profiles SET diamonds = COALESCE(diamonds, 0) + v_reward.reward_coins WHERE id = v_participant.user_id;
        END IF;

        UPDATE public.pk_participants SET reward_distributed = true WHERE id = v_participant.id;

        INSERT INTO public.notifications (user_id, type, title, message, data, is_read) VALUES (
          v_participant.user_id, 'reward', '🏆 PK Competition Reward!',
          'Congratulations! You ranked #' || v_rank || ' in "' || v_comp.title || '"!',
          jsonb_build_object('type', 'pk_reward', 'competition_id', p_competition_id, 'rank', v_rank,
            'reward_diamonds', COALESCE(v_reward.reward_diamonds, 0), 'reward_beans', COALESCE(v_reward.reward_beans, 0),
            'reward_coins', COALESCE(v_reward.reward_coins, 0)),
          false
        );
        v_count := v_count + 1;
      END IF;
    END IF;
  END LOOP;

  IF v_comp.status <> 'ended' THEN
    UPDATE public.pk_competitions SET status = 'ended' WHERE id = p_competition_id;
  END IF;

  RETURN v_count;
END;$function$;

-- === enter_party_room(p_room_id uuid, p_password text) ===

CREATE OR REPLACE FUNCTION public.enter_party_room(p_room_id uuid, p_password text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_room party_rooms%ROWTYPE;
  v_profile record;
  v_user_level int := 0;
  v_required_level int := 0;
  v_is_privileged_joiner boolean := false;
  v_coins bigint;
  v_count int;
  v_role text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;

  SELECT * INTO v_room FROM party_rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND OR v_room.is_active = false THEN RAISE EXCEPTION 'Room not found or not active'; END IF;

  v_role := CASE WHEN v_room.host_id = v_uid THEN 'host' ELSE 'listener' END;

  IF v_role <> 'host' THEN
    SELECT
      COALESCE(is_banned, false) AS is_banned,
      COALESCE(is_blocked, false) AS is_blocked,
      COALESCE(user_level, 0) AS user_level,
      COALESCE(host_level, 0) AS host_level,
      COALESCE(max_user_level, 0) AS max_user_level,
      COALESCE(is_host, false) AS is_host,
      COALESCE(host_status, '') AS host_status,
      COALESCE(gender, '') AS gender
    INTO v_profile
    FROM profiles
    WHERE id = v_uid;

    IF NOT FOUND THEN RAISE EXCEPTION 'profile not found'; END IF;
    IF v_profile.is_banned OR v_profile.is_blocked THEN RAISE EXCEPTION 'You are banned'; END IF;

    v_is_privileged_joiner := v_profile.is_host
      OR lower(v_profile.host_status) = 'approved'
      OR lower(v_profile.gender) = 'female';
    v_user_level := GREATEST(v_profile.user_level, v_profile.host_level, v_profile.max_user_level);

    SELECT COALESCE(CASE WHEN v_is_privileged_joiner THEN min_level_host ELSE min_level_user END, 0)
      INTO v_required_level
    FROM feature_level_requirements
    WHERE feature_key = 'join_party' AND COALESCE(is_active, true) = true
    LIMIT 1;

    IF v_user_level < COALESCE(v_required_level, 0) THEN
      RAISE EXCEPTION 'Level % required to enter', v_required_level;
    END IF;

    IF EXISTS (SELECT 1 FROM live_bans WHERE user_id = v_uid AND is_active = true AND (expires_at IS NULL OR expires_at > now())) THEN
      RAISE EXCEPTION 'You are temporarily banned';
    END IF;

    IF EXISTS (SELECT 1 FROM blocked_users WHERE blocker_id = v_room.host_id AND blocked_id = v_uid)
       OR EXISTS (SELECT 1 FROM user_blocks WHERE blocker_id = v_room.host_id AND blocked_id = v_uid) THEN
      RAISE EXCEPTION 'You are blocked from this room';
    END IF;

    IF COALESCE(v_room.min_level,0) > 0 AND v_user_level < v_room.min_level THEN
      RAISE EXCEPTION 'Level % required to enter', v_room.min_level;
    END IF;

    -- Password gating REMOVED: all party rooms are public (industry standard).

    SELECT COUNT(*) INTO v_count
    FROM party_room_participants
    WHERE room_id = p_room_id AND left_at IS NULL AND user_id <> v_uid;
    IF v_count >= COALESCE(v_room.max_participants, 10) THEN RAISE EXCEPTION 'Room is full'; END IF;

    IF COALESCE(v_room.entry_fee,0) > 0 THEN
      IF NOT EXISTS (SELECT 1 FROM party_room_participants WHERE room_id = p_room_id AND user_id = v_uid) THEN
        SELECT COALESCE(coins,0) INTO v_coins FROM profiles WHERE id = v_uid FOR UPDATE;
        IF v_coins < v_room.entry_fee THEN RAISE EXCEPTION 'Insufficient coins for entry fee'; END IF;
        UPDATE profiles SET diamonds = diamonds - v_room.entry_fee WHERE id = v_uid;
      END IF;
    END IF;
  END IF;

  INSERT INTO party_room_participants(room_id, user_id, role, seat_number, is_muted, joined_at, left_at)
  VALUES (p_room_id, v_uid, v_role, CASE WHEN v_role = 'host' THEN 0 ELSE NULL END, v_role <> 'host', now(), NULL)
  ON CONFLICT (room_id, user_id) DO UPDATE
    SET left_at = NULL,
        role = CASE WHEN party_room_participants.role = 'host' THEN 'host' ELSE EXCLUDED.role END,
        seat_number = CASE WHEN EXCLUDED.role = 'host' THEN COALESCE(party_room_participants.seat_number, 0) ELSE party_room_participants.seat_number END,
        is_muted = CASE WHEN EXCLUDED.role = 'host' THEN false ELSE party_room_participants.is_muted END;

  RETURN jsonb_build_object('ok', true, 'role', v_role);
END;
$function$;

-- === ferris_wheel_play(p_bet_amount bigint, p_chosen_slot integer) ===

CREATE OR REPLACE FUNCTION public.ferris_wheel_play(p_bet_amount bigint, p_chosen_slot integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
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
  UPDATE profiles SET diamonds = v_after_bet, updated_at = now() WHERE id = v_uid;
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
    UPDATE profiles SET diamonds = v_final, updated_at = now() WHERE id = v_uid;
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

-- === game_cashout(p_user_id uuid, p_bet_id uuid, p_win_amount integer, p_multiplier numeric) ===

CREATE OR REPLACE FUNCTION public.game_cashout(p_user_id uuid, p_bet_id uuid, p_win_amount integer, p_multiplier numeric)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_current_coins INTEGER;
  v_new_coins INTEGER;
  v_bet_record RECORD;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() != p_user_id THEN
    RETURN json_build_object('success', false, 'error', 'Unauthorized');
  END IF;
  SELECT coins INTO v_current_coins FROM profiles WHERE id = p_user_id FOR UPDATE;
  IF v_current_coins IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'User not found');
  END IF;
  SELECT lgb.*, lgr.game_id INTO v_bet_record
  FROM live_game_bets lgb JOIN live_game_rounds lgr ON lgb.round_id = lgr.id
  WHERE lgb.id = p_bet_id AND lgb.user_id = p_user_id;
  IF v_bet_record IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Bet not found');
  END IF;
  IF v_bet_record.is_processed THEN
    RETURN json_build_object('success', false, 'error', 'Bet already processed');
  END IF;
  v_new_coins := v_current_coins + p_win_amount;
  UPDATE profiles SET diamonds = v_new_coins WHERE id = p_user_id;
  UPDATE live_game_bets SET is_winner = true, win_amount = p_win_amount, multiplier = p_multiplier, is_processed = true, cashed_out_at = now()
  WHERE id = p_bet_id AND user_id = p_user_id;
  INSERT INTO game_bets (game_id, user_id, bet_amount, bet_type, is_winner, win_amount, multiplier, result)
  VALUES (v_bet_record.game_id, p_user_id, v_bet_record.bet_amount, 'cashout', true, p_win_amount, p_multiplier,
    jsonb_build_object('type', 'cashout', 'multiplier', p_multiplier, 'win_amount', p_win_amount));
  RETURN json_build_object('success', true, 'new_balance', v_new_coins, 'win_amount', p_win_amount, 'multiplier', p_multiplier);
END;
$function$;

-- === handle_game_callback(p_action text, p_token text, p_amount bigint, p_game_id text, p_round_id text, p_details jsonb) ===

CREATE OR REPLACE FUNCTION public.handle_game_callback(p_action text, p_token text, p_amount bigint DEFAULT 0, p_game_id text DEFAULT NULL::text, p_round_id text DEFAULT NULL::text, p_details jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid;
  v_balance bigint;
  v_new_balance bigint;
  v_token_record record;
BEGIN
  SELECT * INTO v_token_record
  FROM game_session_tokens
  WHERE token = p_token AND is_active = true AND expires_at > now();

  IF v_token_record IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid or expired token', 'code', 401);
  END IF;

  v_user_id := v_token_record.user_id;

  SELECT COALESCE(coins, 0) INTO v_balance
  FROM profiles WHERE id = v_user_id;

  CASE p_action
    WHEN 'getUserInfo', 'getBalance' THEN
      RETURN jsonb_build_object('success', true, 'userId', v_user_id, 'balance', v_balance, 'currency', 'DIAMOND');

    WHEN 'placeBet', 'bet', 'debit' THEN
      IF v_balance < p_amount THEN
        RETURN jsonb_build_object('success', false, 'error', 'Insufficient balance', 'code', 402, 'balance', v_balance);
      END IF;
      PERFORM set_config('app.bypass_profile_protection', 'true', true);
      UPDATE profiles SET diamonds = diamonds - p_amount WHERE id = v_user_id;
      v_new_balance := v_balance - p_amount;
      INSERT INTO game_transactions (user_id, game_type, transaction_type, amount, balance_before, balance_after)
      VALUES (v_user_id, COALESCE(p_game_id, v_token_record.game_id, 'external'), 'bet', p_amount, v_balance, v_new_balance);
      RETURN jsonb_build_object('success', true, 'balance', v_new_balance, 'transactionId', gen_random_uuid());

    WHEN 'settleBet', 'win', 'credit' THEN
      PERFORM set_config('app.bypass_profile_protection', 'true', true);
      UPDATE profiles SET diamonds = diamonds + p_amount WHERE id = v_user_id;
      v_new_balance := v_balance + p_amount;
      INSERT INTO game_transactions (user_id, game_type, transaction_type, amount, balance_before, balance_after)
      VALUES (v_user_id, COALESCE(p_game_id, v_token_record.game_id, 'external'), 'win', p_amount, v_balance, v_new_balance);
      RETURN jsonb_build_object('success', true, 'balance', v_new_balance, 'transactionId', gen_random_uuid());

    WHEN 'refund', 'rollback' THEN
      PERFORM set_config('app.bypass_profile_protection', 'true', true);
      UPDATE profiles SET diamonds = diamonds + p_amount WHERE id = v_user_id;
      v_new_balance := v_balance + p_amount;
      INSERT INTO game_transactions (user_id, game_type, transaction_type, amount, balance_before, balance_after)
      VALUES (v_user_id, COALESCE(p_game_id, v_token_record.game_id, 'external'), 'refund', p_amount, v_balance, v_new_balance);
      RETURN jsonb_build_object('success', true, 'balance', v_new_balance);

    ELSE
      RETURN jsonb_build_object('success', false, 'error', 'Unknown action: ' || p_action, 'code', 400);
  END CASE;
END;
$function$;

COMMIT;