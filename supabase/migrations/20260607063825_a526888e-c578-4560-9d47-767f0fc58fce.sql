
CREATE OR REPLACE FUNCTION public.process_gift_transaction(
  p_sender_id uuid,
  p_receiver_id uuid,
  p_gift_id uuid,
  p_quantity integer DEFAULT 1,
  p_stream_id uuid DEFAULT NULL::uuid,
  p_party_room_id uuid DEFAULT NULL::uuid,
  p_call_id uuid DEFAULT NULL::uuid,
  p_reel_id uuid DEFAULT NULL::uuid,
  p_idempotency_key text DEFAULT NULL::text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _gift RECORD;
  _total_cost bigint;
  _new_sender_balance bigint;
  _beans_amount bigint := 0;
  _credit_percent numeric;
  _transaction_id uuid;
  _qty integer;
  _context_count integer;
  _sender RECORD;
  _receiver RECORD;
  _blocked_exists boolean;
  _existing RECORD;
  _idem text;
  _first_id uuid;
  _second_id uuid;
  -- Lucky gift lottery
  _is_lucky boolean := false;
  _diamond_bonus bigint := 0;
  _unit_bonus bigint;
  _roll numeric;
  _cum numeric;
  _cfg RECORD;
  _has_cfg boolean := false;
  _i integer;
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
    SELECT id, sender_id, coin_amount, receiver_beans
      INTO _existing
    FROM public.gift_transactions
    WHERE idempotency_key = _idem;

    IF FOUND THEN
      IF _existing.sender_id IS DISTINCT FROM p_sender_id THEN
        RETURN json_build_object('success', false, 'error', 'Idempotency key conflict');
      END IF;
      RETURN json_build_object(
        'success', true,
        'transaction_id', _existing.id,
        'total_cost', _existing.coin_amount,
        'beans_received', _existing.receiver_beans,
        'idempotent_replay', true
      );
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
    _first_id := p_sender_id;
    _second_id := p_receiver_id;
  ELSE
    _first_id := p_receiver_id;
    _second_id := p_sender_id;
  END IF;

  PERFORM 1 FROM public.profiles WHERE id = _first_id  FOR UPDATE;
  PERFORM 1 FROM public.profiles WHERE id = _second_id FOR UPDATE;

  SELECT id,
         COALESCE(coins, 0)::bigint AS coins,
         COALESCE(user_level, 1)::integer AS user_level,
         COALESCE(is_blocked, false) AS is_blocked,
         COALESCE(is_banned, false) AS is_banned,
         COALESCE(is_deleted, false) AS is_deleted
    INTO _sender
  FROM public.profiles
  WHERE id = p_sender_id;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Sender not found');
  END IF;

  IF _sender.is_blocked OR _sender.is_banned OR _sender.is_deleted THEN
    RETURN json_build_object('success', false, 'error', 'Your account cannot send gifts');
  END IF;

  SELECT id,
         COALESCE(is_blocked, false) AS is_blocked,
         COALESCE(is_banned, false) AS is_banned,
         COALESCE(is_deleted, false) AS is_deleted
    INTO _receiver
  FROM public.profiles
  WHERE id = p_receiver_id;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Receiver not found');
  END IF;

  IF _receiver.is_blocked OR _receiver.is_banned OR _receiver.is_deleted THEN
    RETURN json_build_object('success', false, 'error', 'Recipient is not available');
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.blocked_users
    WHERE (blocker_id = p_sender_id   AND blocked_id = p_receiver_id)
       OR (blocker_id = p_receiver_id AND blocked_id = p_sender_id)
  ) INTO _blocked_exists;

  IF _blocked_exists THEN
    RETURN json_build_object('success', false, 'error', 'Cannot send gift due to block');
  END IF;

  SELECT id,
         name,
         coin_value::bigint AS coin_value,
         icon_url,
         animation_url,
         COALESCE(receiver_beans, 0)::bigint AS receiver_beans,
         COALESCE(min_level, 0)::integer AS min_level,
         COALESCE(is_lucky, false) AS is_lucky
    INTO _gift
  FROM public.gifts
  WHERE id = p_gift_id AND COALESCE(is_active, true) = true
  FOR SHARE;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Gift not found');
  END IF;

  _is_lucky := _gift.is_lucky;

  IF _gift.min_level > 0 AND _sender.user_level < _gift.min_level THEN
    RETURN json_build_object('success', false, 'error', 'Your level is too low for this gift');
  END IF;

  IF _gift.coin_value IS NULL OR _gift.coin_value <= 0 THEN
    RETURN json_build_object('success', false, 'error', 'Invalid gift price');
  END IF;

  IF _gift.receiver_beans < 0 OR _gift.receiver_beans > _gift.coin_value THEN
    RETURN json_build_object('success', false, 'error', 'Invalid gift payout');
  END IF;

  _total_cost := _gift.coin_value * _qty;
  IF _total_cost <= 0 THEN
    RETURN json_build_object('success', false, 'error', 'Invalid gift total');
  END IF;

  IF _sender.coins < _total_cost THEN
    RETURN json_build_object('success', false, 'error', 'Insufficient diamonds');
  END IF;

  IF p_stream_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.live_streams ls
    WHERE ls.id = p_stream_id
      AND ls.host_id = p_receiver_id
      AND COALESCE(ls.is_active, true) = true
      AND COALESCE(ls.status, 'active') NOT IN ('ended', 'finished', 'terminated', 'cancelled')
      AND ls.ended_at IS NULL
  ) THEN
    RETURN json_build_object('success', false, 'error', 'Invalid live gift target');
  END IF;

  IF p_party_room_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.party_rooms pr
    WHERE pr.id = p_party_room_id
      AND pr.host_id = p_receiver_id
      AND COALESCE(pr.is_active, true) = true
      AND pr.ended_at IS NULL
  ) THEN
    RETURN json_build_object('success', false, 'error', 'Invalid party gift target');
  END IF;

  IF p_call_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.private_calls pc
    WHERE pc.id = p_call_id
      AND p_sender_id IN (pc.caller_id, pc.host_id)
      AND p_receiver_id IN (pc.caller_id, pc.host_id)
      AND p_sender_id <> p_receiver_id
      AND COALESCE(pc.status, 'active') NOT IN ('ended', 'cancelled', 'rejected', 'missed', 'failed')
  ) THEN
    RETURN json_build_object('success', false, 'error', 'Invalid call gift target');
  END IF;

  IF p_reel_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.reels r
    WHERE r.id = p_reel_id
      AND r.user_id = p_receiver_id
  ) THEN
    RETURN json_build_object('success', false, 'error', 'Invalid reel gift target');
  END IF;

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

  _new_sender_balance := _sender.coins - _total_cost;
  UPDATE public.profiles
     SET coins = _new_sender_balance,
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
      coin_amount, total_coins, coin_cost, coin_value, diamond_cost,
      receiver_beans,
      stream_id, party_room_id, call_id, reel_id, idempotency_key, created_at
    ) VALUES (
      p_sender_id, p_receiver_id, p_gift_id, _qty,
      _total_cost, _total_cost, _total_cost, _gift.coin_value, _total_cost,
      _beans_amount,
      p_stream_id, p_party_room_id, p_call_id, p_reel_id, _idem, now()
    ) RETURNING id INTO _transaction_id;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'idempotent_replay_conflict' USING ERRCODE = '40001';
  END;

  IF _total_cost <= 2147483000 THEN
    INSERT INTO public.coin_transactions (
      user_id, coins_amount, transaction_type, status, notes, created_at, updated_at
    ) VALUES (
      p_sender_id,
      (-_total_cost)::integer,
      'gift_send',
      'completed',
      'gift_tx:' || _transaction_id::text || ' gift:' || p_gift_id::text || ' qty:' || _qty::text,
      now(), now()
    );
  END IF;

  -- ╔════════════════════════════════════════════════════════════════════╗
  -- ║ LUCKY GIFT LOTTERY                                                ║
  -- ║ Rolls once PER UNIT. Admin-configured tiers override default.    ║
  -- ║ Default ladder EV ≈ 0.285× coin_value (safe, exciting).          ║
  -- ║ Winnings credited as DIAMONDS to sender (instant My Diamond add). ║
  -- ╚════════════════════════════════════════════════════════════════════╝
  IF _is_lucky THEN
    SELECT EXISTS (
      SELECT 1 FROM public.lucky_gift_config
      WHERE gift_id = p_gift_id AND COALESCE(is_active, true) = true
    ) INTO _has_cfg;

    FOR _i IN 1.._qty LOOP
      _roll := random() * 100.0;
      _unit_bonus := 0;

      IF _has_cfg THEN
        _cum := 0;
        FOR _cfg IN
          SELECT diamond_reward, win_chance_percent
          FROM public.lucky_gift_config
          WHERE gift_id = p_gift_id AND COALESCE(is_active, true) = true
          ORDER BY display_order NULLS LAST, id
        LOOP
          _cum := _cum + COALESCE(_cfg.win_chance_percent, 0);
          IF _roll <= _cum THEN
            _unit_bonus := GREATEST(COALESCE(_cfg.diamond_reward, 0)::bigint, 0);
            EXIT;
          END IF;
        END LOOP;
      ELSE
        -- Default safe ladder (EV ≈ 0.285× coin_value)
        IF _roll < 0.5 THEN
          _unit_bonus := FLOOR(_gift.coin_value * 20)::bigint;  -- 0.5% jackpot
        ELSIF _roll < 2.0 THEN
          _unit_bonus := FLOOR(_gift.coin_value * 5)::bigint;   -- 1.5% big win
        ELSIF _roll < 5.0 THEN
          _unit_bonus := FLOOR(_gift.coin_value * 2)::bigint;   -- 3% medium
        ELSIF _roll < 15.0 THEN
          _unit_bonus := FLOOR(_gift.coin_value * 0.5)::bigint; -- 10% small
        ELSE
          _unit_bonus := 0;                                      -- 85% no win
        END IF;
      END IF;

      IF _unit_bonus > 0 THEN
        _diamond_bonus := _diamond_bonus + _unit_bonus;
      END IF;
    END LOOP;

    IF _diamond_bonus > 0 THEN
      _new_sender_balance := _new_sender_balance + _diamond_bonus;
      UPDATE public.profiles
         SET coins = _new_sender_balance
       WHERE id = p_sender_id;

      IF _diamond_bonus <= 2147483000 THEN
        INSERT INTO public.coin_transactions (
          user_id, coins_amount, transaction_type, status, notes, created_at, updated_at
        ) VALUES (
          p_sender_id,
          _diamond_bonus::integer,
          'lucky_bonus',
          'completed',
          'lucky_gift_tx:' || _transaction_id::text || ' gift:' || p_gift_id::text || ' qty:' || _qty::text,
          now(), now()
        );
      END IF;
    END IF;

    -- Log result (winner or not) for analytics + UI history
    BEGIN
      INSERT INTO public.lucky_gift_results (
        user_id, gift_id, receiver_id, diamonds_won, is_winner, created_at
      ) VALUES (
        p_sender_id, p_gift_id, p_receiver_id,
        LEAST(_diamond_bonus, 2147483000)::integer,
        _diamond_bonus > 0,
        now()
      );
    EXCEPTION WHEN OTHERS THEN
      -- Never fail the gift over a result-log issue.
      NULL;
    END;
  END IF;

  RETURN json_build_object(
    'success', true,
    'transaction_id', _transaction_id,
    'total_cost', _total_cost,
    'beans_received', _beans_amount,
    'new_sender_balance', _new_sender_balance,
    'host_percent', _credit_percent,
    'is_lucky', _is_lucky,
    'diamond_bonus', _diamond_bonus
  );
END;
$function$;

GRANT SELECT, INSERT ON public.lucky_gift_results TO authenticated;
GRANT ALL ON public.lucky_gift_results TO service_role;
