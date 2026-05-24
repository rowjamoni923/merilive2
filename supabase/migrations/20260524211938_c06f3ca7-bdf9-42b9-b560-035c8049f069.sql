-- Pkg324 Gifting pass-2: ban + block enforcement inside process_gift_transaction.
-- Pass-1 only checked is_blocked. is_banned was not enforced, so a banned account
-- could still spend coins and a banned host could still be credited beans. Also,
-- blocked_users rows were ignored — a sender could keep showering gifts on a user
-- who explicitly blocked them (and vice versa).

CREATE OR REPLACE FUNCTION public.process_gift_transaction(
  p_sender_id uuid,
  p_receiver_id uuid,
  p_gift_id uuid,
  p_quantity integer DEFAULT 1,
  p_stream_id uuid DEFAULT NULL,
  p_party_room_id uuid DEFAULT NULL,
  p_call_id uuid DEFAULT NULL,
  p_reel_id uuid DEFAULT NULL
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

  _context_count :=
    (CASE WHEN p_stream_id IS NULL THEN 0 ELSE 1 END) +
    (CASE WHEN p_party_room_id IS NULL THEN 0 ELSE 1 END) +
    (CASE WHEN p_call_id IS NULL THEN 0 ELSE 1 END) +
    (CASE WHEN p_reel_id IS NULL THEN 0 ELSE 1 END);

  IF _context_count > 1 THEN
    RETURN json_build_object('success', false, 'error', 'Only one gift context is allowed');
  END IF;

  -- SENDER lock + ban/block check
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

  -- RECEIVER ban/block check
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

  -- Mutual block check (either direction)
  SELECT EXISTS (
    SELECT 1 FROM public.blocked_users
    WHERE (blocker_id = p_sender_id   AND blocked_id = p_receiver_id)
       OR (blocker_id = p_receiver_id AND blocked_id = p_sender_id)
  ) INTO _blocked_exists;

  IF _blocked_exists THEN
    RETURN json_build_object('success', false, 'error', 'Cannot send gift due to block');
  END IF;

  -- GIFT lookup + price/level validation
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

  -- Context target validation (unchanged)
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

  INSERT INTO public.gift_transactions (
    sender_id, receiver_id, gift_id, quantity,
    coin_amount, total_coins, coin_cost, coin_value, diamond_cost,
    receiver_beans,
    stream_id, party_room_id, call_id, reel_id, created_at
  ) VALUES (
    p_sender_id, p_receiver_id, p_gift_id, _qty,
    _total_cost, _total_cost, _total_cost, _gift.coin_value, _total_cost,
    _beans_amount,
    p_stream_id, p_party_room_id, p_call_id, p_reel_id, now()
  ) RETURNING id INTO _transaction_id;

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