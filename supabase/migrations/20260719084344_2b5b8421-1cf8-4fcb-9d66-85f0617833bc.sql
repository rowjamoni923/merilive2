-- Fix process_gift_transaction: remove duplicate diamond_cost column
CREATE OR REPLACE FUNCTION public.process_gift_transaction(p_sender_id uuid, p_receiver_id uuid, p_gift_id uuid, p_quantity integer DEFAULT 1, p_stream_id uuid DEFAULT NULL::uuid, p_party_room_id uuid DEFAULT NULL::uuid, p_call_id uuid DEFAULT NULL::uuid, p_reel_id uuid DEFAULT NULL::uuid, p_idempotency_key text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _gift RECORD; _total_cost bigint; _new_sender_balance bigint;
  _beans_amount bigint := 0; _credit_percent numeric;
  _transaction_id uuid; _qty integer; _context_count integer;
  _sender RECORD; _receiver RECORD; _blocked_exists boolean;
  _existing RECORD; _idem text; _first_id uuid; _second_id uuid;
  _is_lucky boolean := false; _diamond_bonus bigint := 0; _unit_bonus bigint;
  _roll numeric; _cum numeric; _cfg RECORD; _has_cfg boolean := false;
  _i integer; _effective_level integer;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> p_sender_id THEN
    RETURN json_build_object('success', false, 'error', 'Unauthorized sender');
  END IF;
  IF p_sender_id IS NULL OR p_receiver_id IS NULL OR p_gift_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Missing required arguments');
  END IF;
  IF p_sender_id = p_receiver_id THEN
    RETURN json_build_object('success', false, 'error', 'Cannot send gift to self');
  END IF;
  IF p_quantity IS NULL OR p_quantity < 1 OR p_quantity > 999 THEN
    RETURN json_build_object('success', false, 'error', 'Invalid gift quantity');
  END IF;
  _qty := p_quantity;
  PERFORM set_config('app.calling_function', 'process_gift_transaction', true);
  _idem := NULLIF(trim(COALESCE(p_idempotency_key, '')), '');
  IF _idem IS NOT NULL THEN
    SELECT id, sender_id, diamond_amount, receiver_beans INTO _existing
      FROM public.gift_transactions WHERE idempotency_key = _idem;
    IF FOUND THEN
      IF _existing.sender_id IS DISTINCT FROM p_sender_id THEN
        RETURN json_build_object('success', false, 'error', 'Idempotency key conflict');
      END IF;
      RETURN json_build_object('success', true, 'transaction_id', _existing.id,
        'total_cost', _existing.diamond_amount, 'beans_received', _existing.receiver_beans,
        'idempotent_replay', true);
    END IF;
  END IF;
  _context_count :=
    (CASE WHEN p_stream_id IS NULL THEN 0 ELSE 1 END) +
    (CASE WHEN p_party_room_id IS NULL THEN 0 ELSE 1 END) +
    (CASE WHEN p_call_id IS NULL THEN 0 ELSE 1 END) +
    (CASE WHEN p_reel_id IS NULL THEN 0 ELSE 1 END);
  IF _context_count > 1 THEN
    RETURN json_build_object('success', false, 'error', 'Only one gift context is allowed');
  END IF;
  IF p_sender_id < p_receiver_id THEN
    _first_id := p_sender_id; _second_id := p_receiver_id;
  ELSE
    _first_id := p_receiver_id; _second_id := p_sender_id;
  END IF;
  PERFORM 1 FROM public.profiles WHERE id = _first_id  FOR UPDATE;
  PERFORM 1 FROM public.profiles WHERE id = _second_id FOR UPDATE;
  SELECT id, COALESCE(diamonds, 0)::bigint AS diamonds,
         GREATEST(
           COALESCE(user_level, 1),
           COALESCE(max_user_level, 1),
           COALESCE((
             SELECT MAX(level_number) FROM public.user_level_tiers t
             WHERE COALESCE(t.tier_type, 'user') = 'user'
               AND COALESCE(t.is_active, true) = true
               AND COALESCE(t.min_topup_amount, 0) <= COALESCE(p.total_recharged, 0)
           ), 1)
         )::integer AS user_level,
         COALESCE(is_blocked, false) AS is_blocked,
         COALESCE(is_banned, false) AS is_banned,
         COALESCE(is_deleted, false) AS is_deleted
    INTO _sender FROM public.profiles p WHERE id = p_sender_id;
  IF NOT FOUND THEN RETURN json_build_object('success', false, 'error', 'Sender not found'); END IF;
  IF _sender.is_blocked OR _sender.is_banned OR _sender.is_deleted THEN
    RETURN json_build_object('success', false, 'error', 'Your account cannot send gifts');
  END IF;
  SELECT id, COALESCE(is_blocked, false) AS is_blocked,
         COALESCE(is_banned, false) AS is_banned,
         COALESCE(is_deleted, false) AS is_deleted
    INTO _receiver FROM public.profiles WHERE id = p_receiver_id;
  IF NOT FOUND THEN RETURN json_build_object('success', false, 'error', 'Receiver not found'); END IF;
  IF _receiver.is_blocked OR _receiver.is_banned OR _receiver.is_deleted THEN
    RETURN json_build_object('success', false, 'error', 'Recipient is not available');
  END IF;
  SELECT EXISTS (
    SELECT 1 FROM public.blocked_users
    WHERE (blocker_id = p_sender_id AND blocked_id = p_receiver_id)
       OR (blocker_id = p_receiver_id AND blocked_id = p_sender_id)
  ) INTO _blocked_exists;
  IF _blocked_exists THEN
    RETURN json_build_object('success', false, 'error', 'Cannot send gift due to block');
  END IF;
  SELECT id, name, diamond_value::bigint AS diamond_value, icon_url, animation_url,
         COALESCE(receiver_beans, 0)::bigint AS receiver_beans,
         COALESCE(min_level, 0)::integer AS min_level,
         COALESCE(is_lucky, false) AS is_lucky
    INTO _gift FROM public.gifts
    WHERE id = p_gift_id AND COALESCE(is_active, true) = true FOR SHARE;
  IF NOT FOUND THEN RETURN json_build_object('success', false, 'error', 'Gift not found'); END IF;
  _is_lucky := _gift.is_lucky;
  _effective_level := _sender.user_level;
  IF _gift.min_level > 0 AND _effective_level < _gift.min_level THEN
    RETURN json_build_object('success', false,
      'error', 'Requires Lv.' || _gift.min_level || ' to send this gift (you are Lv.' || _effective_level || ')',
      'required_level', _gift.min_level, 'current_level', _effective_level);
  END IF;
  IF _gift.diamond_value IS NULL OR _gift.diamond_value <= 0 THEN
    RETURN json_build_object('success', false, 'error', 'Invalid gift price');
  END IF;
  IF _gift.receiver_beans < 0 OR _gift.receiver_beans > _gift.diamond_value THEN
    RETURN json_build_object('success', false, 'error', 'Invalid gift payout');
  END IF;
  _total_cost := _gift.diamond_value * _qty;
  IF _total_cost <= 0 THEN RETURN json_build_object('success', false, 'error', 'Invalid gift total'); END IF;
  IF _sender.diamonds < _total_cost THEN
    RETURN json_build_object('success', false, 'error', 'Insufficient diamonds');
  END IF;
  IF p_stream_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.live_streams ls
    WHERE ls.id = p_stream_id AND ls.host_id = p_receiver_id
      AND COALESCE(ls.is_active, true) = true
      AND COALESCE(ls.status, 'active') NOT IN ('ended', 'finished', 'terminated', 'cancelled')
      AND ls.ended_at IS NULL
  ) THEN RETURN json_build_object('success', false, 'error', 'Invalid live gift target'); END IF;
  IF p_party_room_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.party_rooms pr
    WHERE pr.id = p_party_room_id AND pr.host_id = p_receiver_id
      AND COALESCE(pr.is_active, true) = true AND pr.ended_at IS NULL
  ) THEN RETURN json_build_object('success', false, 'error', 'Invalid party gift target'); END IF;
  IF p_call_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.private_calls pc
    WHERE pc.id = p_call_id
      AND p_sender_id IN (pc.caller_id, pc.host_id)
      AND p_receiver_id IN (pc.caller_id, pc.host_id)
      AND p_sender_id <> p_receiver_id
      AND COALESCE(pc.status, 'active') NOT IN ('ended', 'cancelled', 'rejected', 'missed', 'failed')
  ) THEN RETURN json_build_object('success', false, 'error', 'Invalid call gift target'); END IF;
  IF p_reel_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.reels r WHERE r.id = p_reel_id AND r.user_id = p_receiver_id
  ) THEN RETURN json_build_object('success', false, 'error', 'Invalid reel gift target'); END IF;
  IF _gift.receiver_beans > 0 THEN
    _beans_amount := _gift.receiver_beans * _qty;
    _credit_percent := NULL;
  ELSE
    _credit_percent := public.get_effective_host_percent();
    IF _credit_percent IS NULL OR _credit_percent < 0 OR _credit_percent > 100 THEN
      RETURN json_build_object('success', false,
        'error', 'Gift commission is not configured. Admin must set gift_commission.host_percent.');
    END IF;
    _beans_amount := FLOOR(_total_cost::numeric * _credit_percent / 100)::bigint;
  END IF;
  IF _beans_amount < 0 OR _beans_amount > _total_cost THEN
    RETURN json_build_object('success', false, 'error', 'Invalid computed gift payout');
  END IF;
  PERFORM set_config('app.bypass_profile_protection', 'true', true);
  _new_sender_balance := _sender.diamonds - _total_cost;
  UPDATE public.profiles
     SET diamonds = _new_sender_balance,
         total_consumption = COALESCE(total_consumption, 0) + _total_cost
   WHERE id = p_sender_id;
  IF _beans_amount > 0 THEN
    UPDATE public.profiles
       SET beans = COALESCE(beans, 0) + _beans_amount,
           total_earnings = COALESCE(total_earnings, 0) + _beans_amount,
           weekly_earnings = COALESCE(weekly_earnings, 0) + _beans_amount,
           pending_earnings = COALESCE(pending_earnings, 0) + _beans_amount
     WHERE id = p_receiver_id;
  END IF;
  BEGIN
    INSERT INTO public.gift_transactions (
      sender_id, receiver_id, gift_id, quantity,
      diamond_amount, total_diamonds, diamond_cost, diamond_value,
      receiver_beans, stream_id, party_room_id, call_id, reel_id, idempotency_key, created_at
    ) SELECT
      p_sender_id, p_receiver_id, p_gift_id, _qty,
      _total_cost, _total_cost, _total_cost, _gift.diamond_value,
      _beans_amount, p_stream_id, p_party_room_id, p_call_id, p_reel_id, _idem, now()
    RETURNING id INTO _transaction_id;
  EXCEPTION WHEN OTHERS THEN RAISE; END;
  RETURN json_build_object('success', true, 'transaction_id', _transaction_id,
    'total_cost', _total_cost, 'beans_received', _beans_amount,
    'new_sender_balance', _new_sender_balance, 'host_percent', _credit_percent,
    'is_lucky', _is_lucky, 'diamond_bonus', _diamond_bonus);
END; $function$;

-- Fix distribute_period_rewards: dedupe reward_diamonds column & GREATEST args
CREATE OR REPLACE FUNCTION public.distribute_period_rewards(p_category text, p_period_type text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_start_date timestamptz;
  v_end_date timestamptz;
  v_period_label text;
  v_count integer := 0;
  v_reward record;
  v_entry record;
  v_rank integer := 0;
  v_already boolean;
  v_bst_now timestamp;
  v_bst_today date;
  v_reward_amount bigint;
  v_inserted boolean;
BEGIN
  IF p_category NOT IN ('host_earnings', 'game_winners', 'top_gifters') THEN
    RETURN 0;
  END IF;

  v_bst_now := (now() AT TIME ZONE 'Asia/Dhaka');
  IF v_bst_now::time < '00:30:00'::time THEN
    v_bst_today := (v_bst_now - interval '1 day')::date;
  ELSE
    v_bst_today := v_bst_now::date;
  END IF;

  IF p_period_type = 'daily' THEN
    v_end_date := (v_bst_today::timestamp + interval '30 minutes') AT TIME ZONE 'Asia/Dhaka';
    v_start_date := v_end_date - interval '1 day';
    v_period_label := to_char(v_bst_today - interval '1 day', 'YYYY-MM-DD');
  ELSIF p_period_type = 'weekly' THEN
    DECLARE v_dow integer;
    BEGIN
      v_dow := EXTRACT(ISODOW FROM v_bst_today);
      v_end_date := ((v_bst_today - (v_dow - 1) * interval '1 day')::timestamp + interval '30 minutes') AT TIME ZONE 'Asia/Dhaka';
      v_start_date := v_end_date - interval '1 week';
      v_period_label := 'week-' || to_char((v_start_date AT TIME ZONE 'Asia/Dhaka')::date, 'IYYY-IW');
    END;
  ELSIF p_period_type = 'monthly' THEN
    v_end_date := (date_trunc('month', v_bst_today)::timestamp + interval '30 minutes') AT TIME ZONE 'Asia/Dhaka';
    v_start_date := v_end_date - interval '1 month';
    v_period_label := 'month-' || to_char((v_start_date AT TIME ZONE 'Asia/Dhaka')::date, 'YYYY-MM');
  ELSE
    RETURN 0;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.leaderboard_reward_history
    WHERE category = p_category AND period_type = p_period_type AND period_label = v_period_label
    LIMIT 1
  ) INTO v_already;
  IF v_already THEN RETURN 0; END IF;

  IF p_category = 'host_earnings' THEN
    FOR v_entry IN (
      WITH gift_earn AS (
        SELECT gt.receiver_id AS uid, COALESCE(SUM(gt.receiver_beans), 0)::bigint AS amt
        FROM public.gift_transactions gt
        WHERE gt.created_at >= v_start_date AND gt.created_at < v_end_date AND gt.receiver_id IS NOT NULL
        GROUP BY gt.receiver_id
      ),
      call_earn AS (
        SELECT pc.host_id AS uid, COALESCE(SUM(COALESCE(pc.host_earnings_amount, pc.host_earned, 0)), 0)::bigint AS amt
        FROM public.private_calls pc
        WHERE pc.ended_at >= v_start_date AND pc.ended_at < v_end_date AND pc.host_id IS NOT NULL
        GROUP BY pc.host_id
      ),
      combined AS (
        SELECT uid, SUM(amt)::bigint AS total
        FROM (SELECT uid, amt FROM gift_earn UNION ALL SELECT uid, amt FROM call_earn) s
        GROUP BY uid HAVING SUM(amt) > 0
      )
      SELECT p.id AS user_id, c.total AS stat_value
      FROM combined c
      JOIN public.profiles p ON p.id = c.uid
      WHERE p.is_host = true AND LOWER(COALESCE(p.gender, '')) = 'female'
      ORDER BY c.total DESC
      LIMIT 50
    ) LOOP
      v_rank := v_rank + 1;
      SELECT * INTO v_reward FROM public.leaderboard_reward_config
      WHERE category = p_category AND period_type = p_period_type AND is_active = true
        AND v_rank >= rank_from AND v_rank <= rank_to LIMIT 1;
      IF v_reward IS NULL THEN CONTINUE; END IF;
      IF COALESCE(v_reward.min_target, 0) > 0 AND v_entry.stat_value < v_reward.min_target THEN CONTINUE; END IF;
      v_reward_amount := GREATEST(COALESCE(v_reward.reward_beans, 0), COALESCE(v_reward.reward_diamonds, 0));
      IF v_reward_amount <= 0 THEN CONTINUE; END IF;

      v_inserted := false;
      INSERT INTO public.leaderboard_reward_history
        (user_id, category, period_type, period_label, rank_position, stat_value,
         reward_diamonds, reward_beans, sent_at, distributed_at,
         leaderboard_type, reward_type, reward_amount, period_start, period_end, status)
      VALUES (v_entry.user_id, p_category, p_period_type, v_period_label, v_rank, v_entry.stat_value,
              0, v_reward_amount, now(), now(),
              p_category, 'beans', v_reward_amount, v_start_date, v_end_date, 'sent')
      ON CONFLICT (category, period_type, period_label, user_id) DO NOTHING
      RETURNING true INTO v_inserted;

      IF COALESCE(v_inserted, false) THEN
        PERFORM public._internal_add_beans(v_entry.user_id, v_reward_amount::integer);
        INSERT INTO public.notifications (user_id, type, title, message, data, is_read) VALUES (
          v_entry.user_id, 'reward',
          '🏆 ' || CASE p_period_type WHEN 'daily' THEN 'Daily' WHEN 'weekly' THEN 'Weekly' ELSE 'Monthly' END || ' Host Rank #' || v_rank || '!',
          'You ranked #' || v_rank || ' and earned ' || v_reward_amount || ' Beans!',
          jsonb_build_object('category', p_category, 'period_type', p_period_type, 'rank', v_rank, 'reward_beans', v_reward_amount), false);
        v_count := v_count + 1;
      END IF;
    END LOOP;
  END IF;

  IF p_category = 'game_winners' THEN
    v_rank := 0;
    FOR v_entry IN (
      SELECT gb.player_id AS user_id, COALESCE(SUM(gb.payout), 0)::bigint AS stat_value
      FROM public.game_bets gb
      WHERE gb.created_at >= v_start_date AND gb.created_at < v_end_date
        AND gb.player_id IS NOT NULL AND COALESCE(gb.payout, 0) > 0
      GROUP BY gb.player_id
      HAVING COALESCE(SUM(gb.payout), 0) > 0
      ORDER BY stat_value DESC
      LIMIT 50
    ) LOOP
      v_rank := v_rank + 1;
      SELECT * INTO v_reward FROM public.leaderboard_reward_config
      WHERE category = p_category AND period_type = p_period_type AND is_active = true
        AND v_rank >= rank_from AND v_rank <= rank_to LIMIT 1;
      IF v_reward IS NULL THEN CONTINUE; END IF;
      IF COALESCE(v_reward.min_target, 0) > 0 AND v_entry.stat_value < v_reward.min_target THEN CONTINUE; END IF;
      v_reward_amount := GREATEST(COALESCE(v_reward.reward_diamonds, 0), COALESCE(v_reward.reward_beans, 0));
      IF v_reward_amount <= 0 THEN CONTINUE; END IF;

      v_inserted := false;
      INSERT INTO public.leaderboard_reward_history
        (user_id, category, period_type, period_label, rank_position, stat_value,
         reward_diamonds, reward_beans, sent_at, distributed_at,
         leaderboard_type, reward_type, reward_amount, period_start, period_end, status)
      VALUES (v_entry.user_id, p_category, p_period_type, v_period_label, v_rank, v_entry.stat_value,
              v_reward_amount, 0, now(), now(),
              p_category, 'diamonds', v_reward_amount, v_start_date, v_end_date, 'sent')
      ON CONFLICT (category, period_type, period_label, user_id) DO NOTHING
      RETURNING true INTO v_inserted;

      IF COALESCE(v_inserted, false) THEN
        PERFORM public._internal_add_diamonds(v_entry.user_id, v_reward_amount::integer);
        INSERT INTO public.notifications (user_id, type, title, message, data, is_read) VALUES (
          v_entry.user_id, 'reward',
          '🏆 ' || CASE p_period_type WHEN 'daily' THEN 'Daily' WHEN 'weekly' THEN 'Weekly' ELSE 'Monthly' END || ' Game Rank #' || v_rank || '!',
          'You ranked #' || v_rank || ' and earned ' || v_reward_amount || ' Diamonds!',
          jsonb_build_object('category', p_category, 'period_type', p_period_type, 'rank', v_rank, 'reward_diamonds', v_reward_amount), false);
        v_count := v_count + 1;
      END IF;
    END LOOP;
  END IF;

  IF p_category = 'top_gifters' THEN
    v_rank := 0;
    FOR v_entry IN (
      WITH gift_spend AS (
        SELECT gt.sender_id AS uid, COALESCE(SUM(gt.diamond_cost), 0)::bigint AS amt
        FROM public.gift_transactions gt
        WHERE gt.created_at >= v_start_date AND gt.created_at < v_end_date AND gt.sender_id IS NOT NULL
        GROUP BY gt.sender_id
      ),
      call_spend AS (
        SELECT pc.caller_id AS uid, COALESCE(SUM(COALESCE(pc.total_diamonds_deducted, pc.diamonds_spent, 0)), 0)::bigint AS amt
        FROM public.private_calls pc
        WHERE pc.ended_at >= v_start_date AND pc.ended_at < v_end_date AND pc.caller_id IS NOT NULL
        GROUP BY pc.caller_id
      ),
      game_spend AS (
        SELECT gb.player_id AS uid, COALESCE(SUM(gb.bet_amount), 0)::bigint AS amt
        FROM public.game_bets gb
        WHERE gb.created_at >= v_start_date AND gb.created_at < v_end_date AND gb.player_id IS NOT NULL
        GROUP BY gb.player_id
      ),
      combined AS (
        SELECT uid, SUM(amt)::bigint AS total
        FROM (SELECT uid, amt FROM gift_spend UNION ALL SELECT uid, amt FROM call_spend UNION ALL SELECT uid, amt FROM game_spend) s
        GROUP BY uid HAVING SUM(amt) > 0
      )
      SELECT p.id AS user_id, c.total AS stat_value
      FROM combined c
      JOIN public.profiles p ON p.id = c.uid
      WHERE LOWER(COALESCE(p.gender, '')) = 'male'
      ORDER BY c.total DESC
      LIMIT 50
    ) LOOP
      v_rank := v_rank + 1;
      SELECT * INTO v_reward FROM public.leaderboard_reward_config
      WHERE category = p_category AND period_type = p_period_type AND is_active = true
        AND v_rank >= rank_from AND v_rank <= rank_to LIMIT 1;
      IF v_reward IS NULL THEN CONTINUE; END IF;
      IF COALESCE(v_reward.min_target, 0) > 0 AND v_entry.stat_value < v_reward.min_target THEN CONTINUE; END IF;
      v_reward_amount := GREATEST(COALESCE(v_reward.reward_diamonds, 0), COALESCE(v_reward.reward_beans, 0));
      IF v_reward_amount <= 0 THEN CONTINUE; END IF;

      v_inserted := false;
      INSERT INTO public.leaderboard_reward_history
        (user_id, category, period_type, period_label, rank_position, stat_value,
         reward_diamonds, reward_beans, sent_at, distributed_at,
         leaderboard_type, reward_type, reward_amount, period_start, period_end, status)
      VALUES (v_entry.user_id, p_category, p_period_type, v_period_label, v_rank, v_entry.stat_value,
              v_reward_amount, 0, now(), now(),
              p_category, 'diamonds', v_reward_amount, v_start_date, v_end_date, 'sent')
      ON CONFLICT (category, period_type, period_label, user_id) DO NOTHING
      RETURNING true INTO v_inserted;

      IF COALESCE(v_inserted, false) THEN
        PERFORM public._internal_add_diamonds(v_entry.user_id, v_reward_amount::integer);
        INSERT INTO public.notifications (user_id, type, title, message, data, is_read) VALUES (
          v_entry.user_id, 'reward',
          '🏆 ' || CASE p_period_type WHEN 'daily' THEN 'Daily' WHEN 'weekly' THEN 'Weekly' ELSE 'Monthly' END || ' Gifter Rank #' || v_rank || '!',
          'You ranked #' || v_rank || ' and earned ' || v_reward_amount || ' Diamonds!',
          jsonb_build_object('category', p_category, 'period_type', p_period_type, 'rank', v_rank, 'reward_diamonds', v_reward_amount), false);
        v_count := v_count + 1;
      END IF;
    END LOOP;
  END IF;

  RETURN v_count;
END;
$function$;