
-- ============================================================
-- BUG #1: place_game_bet / process_game_win auth + anon revoke
-- ============================================================

-- place_game_bet(uuid, bigint, text)
CREATE OR REPLACE FUNCTION public.place_game_bet(p_user_id uuid, p_amount bigint, p_game_type text DEFAULT 'unknown'::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_current_balance BIGINT;
  v_new_balance BIGINT;
BEGIN
  IF COALESCE(auth.role(),'') <> 'service_role'
     AND NOT public.is_admin(auth.uid())
     AND NOT public.is_active_admin_session()
     AND auth.uid() IS DISTINCT FROM p_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  SELECT coins INTO v_current_balance FROM profiles WHERE id = p_user_id FOR UPDATE;
  IF v_current_balance IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'User not found');
  END IF;
  IF v_current_balance < p_amount THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient balance', 'balance', v_current_balance);
  END IF;
  v_new_balance := v_current_balance - p_amount;
  PERFORM set_config('app.bypass_profile_protection', 'true', true);
  UPDATE profiles SET coins = v_new_balance WHERE id = p_user_id;
  INSERT INTO game_transactions (user_id, game_type, transaction_type, amount, balance_before, balance_after)
  VALUES (p_user_id, p_game_type, 'bet', p_amount, v_current_balance, v_new_balance);
  RETURN jsonb_build_object('success', true, 'balance', v_new_balance, 'deducted', p_amount);
END;
$function$;

-- place_game_bet(uuid, integer, text)  (wrapper)
CREATE OR REPLACE FUNCTION public.place_game_bet(p_user_id uuid, p_bet_amount integer, p_game_type text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF COALESCE(auth.role(),'') <> 'service_role'
     AND NOT public.is_admin(auth.uid())
     AND NOT public.is_active_admin_session()
     AND auth.uid() IS DISTINCT FROM p_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;
  RETURN public.place_game_bet(p_user_id, p_bet_amount,
    COALESCE(NULLIF(trim(p_game_type), ''), 'game'),
    COALESCE(NULLIF(trim(p_game_type), ''), 'game'));
END;
$function$;

-- place_game_bet(uuid, text, integer)  (diamonds_balance variant)
CREATE OR REPLACE FUNCTION public.place_game_bet(p_user_id uuid, p_game_type text, p_bet_amount integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE _cb INTEGER; _nb INTEGER;
BEGIN
  IF COALESCE(auth.role(),'') <> 'service_role'
     AND NOT public.is_admin(auth.uid())
     AND NOT public.is_active_admin_session()
     AND auth.uid() IS DISTINCT FROM p_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;
  SELECT diamonds_balance INTO _cb FROM public.profiles WHERE id = p_user_id FOR UPDATE;
  IF _cb IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'User not found'); END IF;
  IF _cb < p_bet_amount THEN RETURN jsonb_build_object('success', false, 'error', 'Insufficient balance', 'current_balance', _cb); END IF;
  _nb := _cb - p_bet_amount;
  UPDATE public.profiles SET diamonds_balance = _nb, updated_at = now() WHERE id = p_user_id;
  INSERT INTO public.game_transactions (user_id, game_type, transaction_type, amount, balance_before, balance_after)
  VALUES (p_user_id, p_game_type, 'bet', p_bet_amount, _cb, _nb);
  RETURN jsonb_build_object('success', true, 'new_balance', _nb);
END;
$function$;

-- place_game_bet(uuid, integer, text, text)  (canonical 4-arg)
CREATE OR REPLACE FUNCTION public.place_game_bet(p_user_id uuid, p_amount integer, p_game_id text, p_game_name text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_cur bigint; v_new bigint; v_amt bigint; v_label text;
BEGIN
  IF COALESCE(auth.role(),'') <> 'service_role'
     AND NOT public.is_admin(auth.uid())
     AND NOT public.is_active_admin_session()
     AND auth.uid() IS DISTINCT FROM p_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;
  v_amt := GREATEST(0, p_amount::bigint);
  IF v_amt <= 0 THEN RETURN jsonb_build_object('success', false, 'error', 'Invalid bet amount'); END IF;
  v_label := NULLIF(trim(COALESCE(p_game_name, '')), '');
  IF v_label IS NULL THEN v_label := NULLIF(trim(COALESCE(p_game_id, '')), ''); END IF;
  IF v_label IS NULL THEN v_label := 'unknown'; END IF;
  SELECT coins INTO v_cur FROM public.profiles WHERE id = p_user_id FOR UPDATE;
  IF v_cur IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'User not found'); END IF;
  IF v_cur < v_amt THEN RETURN jsonb_build_object('success', false, 'error', 'Insufficient diamonds', 'balance', v_cur, 'current_balance', v_cur); END IF;
  v_new := v_cur - v_amt;
  PERFORM set_config('app.bypass_profile_protection', 'true', true);
  UPDATE public.profiles SET coins = v_new, updated_at = now() WHERE id = p_user_id;
  INSERT INTO public.game_transactions (user_id, game_type, transaction_type, amount, balance_before, balance_after)
  VALUES (p_user_id, v_label, 'bet', v_amt, v_cur, v_new);
  RETURN jsonb_build_object('success', true, 'new_balance', v_new, 'balance', v_new, 'deducted', v_amt);
END;
$function$;

-- process_game_win(uuid, bigint, text)
CREATE OR REPLACE FUNCTION public.process_game_win(p_user_id uuid, p_amount bigint, p_game_type text DEFAULT 'unknown'::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF COALESCE(auth.role(),'') <> 'service_role'
     AND NOT public.is_admin(auth.uid())
     AND NOT public.is_active_admin_session()
     AND auth.uid() IS DISTINCT FROM p_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;
  RETURN public.process_game_win(p_user_id, p_amount,
    COALESCE(NULLIF(trim(p_game_type), ''), 'unknown'),
    COALESCE(NULLIF(trim(p_game_type), ''), 'unknown'), NULL, false);
END;
$function$;

-- process_game_win(uuid, text, integer)  (diamonds_balance variant)
CREATE OR REPLACE FUNCTION public.process_game_win(p_user_id uuid, p_game_type text, p_win_amount integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE _cb INTEGER; _nb INTEGER;
BEGIN
  IF COALESCE(auth.role(),'') <> 'service_role'
     AND NOT public.is_admin(auth.uid())
     AND NOT public.is_active_admin_session()
     AND auth.uid() IS DISTINCT FROM p_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;
  SELECT diamonds_balance INTO _cb FROM public.profiles WHERE id = p_user_id FOR UPDATE;
  IF _cb IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'User not found'); END IF;
  _nb := _cb + p_win_amount;
  UPDATE public.profiles SET diamonds_balance = _nb, updated_at = now() WHERE id = p_user_id;
  INSERT INTO public.game_transactions (user_id, game_type, transaction_type, amount, balance_before, balance_after)
  VALUES (p_user_id, p_game_type, 'win', p_win_amount, _cb, _nb);
  RETURN jsonb_build_object('success', true, 'new_balance', _nb);
END;
$function$;

-- process_game_win(uuid, bigint, text, text, numeric, boolean)  (canonical)
CREATE OR REPLACE FUNCTION public.process_game_win(p_user_id uuid, p_amount bigint, p_game_id text, p_game_name text, p_multiplier numeric DEFAULT NULL::numeric, p_is_jackpot boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_cur bigint; v_new bigint; v_amt bigint; v_label text;
BEGIN
  IF COALESCE(auth.role(),'') <> 'service_role'
     AND NOT public.is_admin(auth.uid())
     AND NOT public.is_active_admin_session()
     AND auth.uid() IS DISTINCT FROM p_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;
  v_amt := GREATEST(0, p_amount);
  IF v_amt <= 0 THEN RETURN jsonb_build_object('success', false, 'error', 'Invalid win amount'); END IF;
  v_label := NULLIF(trim(COALESCE(p_game_name, '')), '');
  IF v_label IS NULL THEN v_label := NULLIF(trim(COALESCE(p_game_id, '')), ''); END IF;
  IF v_label IS NULL THEN v_label := 'unknown'; END IF;
  SELECT coins INTO v_cur FROM public.profiles WHERE id = p_user_id FOR UPDATE;
  IF v_cur IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'User not found'); END IF;
  v_new := v_cur + v_amt;
  PERFORM set_config('app.bypass_profile_protection', 'true', true);
  UPDATE public.profiles SET coins = v_new, updated_at = now() WHERE id = p_user_id;
  INSERT INTO public.game_transactions (user_id, game_type, transaction_type, amount, balance_before, balance_after)
  VALUES (p_user_id, v_label, 'win', v_amt, v_cur, v_new);
  RETURN jsonb_build_object('success', true, 'new_balance', v_new, 'balance', v_new, 'added', v_amt);
END;
$function$;

-- process_game_win(uuid, integer, text, text, numeric, boolean)
CREATE OR REPLACE FUNCTION public.process_game_win(p_user_id uuid, p_amount integer, p_game_id text, p_game_name text, p_multiplier numeric DEFAULT NULL::numeric, p_is_jackpot boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_current_balance BIGINT;
  v_new_balance BIGINT;
BEGIN
  IF COALESCE(auth.role(),'') <> 'service_role'
     AND NOT public.is_admin(auth.uid())
     AND NOT public.is_active_admin_session()
     AND auth.uid() IS DISTINCT FROM p_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;
  IF p_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid win amount');
  END IF;
  SELECT coins INTO v_current_balance FROM profiles WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'User not found');
  END IF;
  v_new_balance := v_current_balance + p_amount;
  UPDATE profiles SET coins = v_new_balance WHERE id = p_user_id;
  INSERT INTO game_transactions (user_id, game_type, transaction_type, amount, balance_before, balance_after)
  VALUES (p_user_id, p_game_name, 'win', p_amount, v_current_balance, v_new_balance);
  RETURN jsonb_build_object('success', true, 'new_balance', v_new_balance);
END;
$function$;

-- Revoke anon execute on every overload
REVOKE EXECUTE ON FUNCTION public.place_game_bet(uuid, bigint, text) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.place_game_bet(uuid, integer, text) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.place_game_bet(uuid, text, integer) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.place_game_bet(uuid, integer, text, text) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.process_game_win(uuid, bigint, text) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.process_game_win(uuid, text, integer) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.process_game_win(uuid, bigint, text, text, numeric, boolean) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.process_game_win(uuid, integer, text, text, numeric, boolean) FROM anon, PUBLIC;

GRANT EXECUTE ON FUNCTION public.place_game_bet(uuid, bigint, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.place_game_bet(uuid, integer, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.place_game_bet(uuid, text, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.place_game_bet(uuid, integer, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.process_game_win(uuid, bigint, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.process_game_win(uuid, text, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.process_game_win(uuid, bigint, text, text, numeric, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.process_game_win(uuid, integer, text, text, numeric, boolean) TO authenticated, service_role;

-- ============================================================
-- BUG #2: gift idempotency
-- ============================================================

ALTER TABLE public.gift_transactions
  ADD COLUMN IF NOT EXISTS idempotency_key text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_gift_tx_idempotency_key
  ON public.gift_transactions(idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE OR REPLACE FUNCTION public.process_gift_transaction(
  p_sender_id uuid,
  p_receiver_id uuid,
  p_gift_id uuid,
  p_quantity integer DEFAULT 1,
  p_stream_id uuid DEFAULT NULL::uuid,
  p_party_room_id uuid DEFAULT NULL::uuid,
  p_call_id uuid DEFAULT NULL::uuid,
  p_reel_id uuid DEFAULT NULL::uuid,
  p_idempotency_key text DEFAULT NULL
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

  SELECT id,
         COALESCE(coins, 0)::bigint AS coins,
         COALESCE(user_level, 1)::integer AS user_level,
         COALESCE(is_blocked, false) AS is_blocked,
         COALESCE(is_banned, false) AS is_banned,
         COALESCE(is_deleted, false) AS is_deleted
    INTO _sender
  FROM public.profiles
  WHERE id = p_sender_id
  FOR UPDATE;

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
         COALESCE(min_level, 0)::integer AS min_level
    INTO _gift
  FROM public.gifts
  WHERE id = p_gift_id AND COALESCE(is_active, true) = true
  FOR SHARE;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Gift not found');
  END IF;

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
    -- Concurrent replay landed the row first; roll back deductions and return the original
    RAISE EXCEPTION 'idempotent_replay_conflict' USING ERRCODE = '40001';
  END;

  RETURN json_build_object(
    'success', true,
    'transaction_id', _transaction_id,
    'total_cost', _total_cost,
    'beans_received', _beans_amount,
    'new_sender_balance', _new_sender_balance,
    'host_percent', _credit_percent
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.process_gift_transaction(uuid, uuid, uuid, integer, uuid, uuid, uuid, uuid, text) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.process_gift_transaction(uuid, uuid, uuid, integer, uuid, uuid, uuid, uuid, text) TO authenticated, service_role;
