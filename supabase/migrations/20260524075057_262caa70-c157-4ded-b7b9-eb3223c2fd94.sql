
-- ============================================================
-- FIX 1: Remove direct INSERT on pk_battle_gifts.
-- All rows must come from the SECURITY DEFINER trigger
-- handle_pk_gift_scoring (which fires on a real, paid gift_transactions row).
-- Without this, any authenticated user could POST fabricated PK gift rows
-- with arbitrary battle_id / coin_amount / target_host_id and corrupt
-- realtime PK leaderboards (and any client-side SUM over pk_battle_gifts).
-- ============================================================
DROP POLICY IF EXISTS "u_ins_pk_gifts" ON public.pk_battle_gifts;
DROP POLICY IF EXISTS "Authenticated users can send PK gifts" ON public.pk_battle_gifts;

-- ============================================================
-- FIX 2: handle_pk_gift_scoring must only credit gifts that
--        actually happened inside one of the two PK streams.
-- Previously a gift sent via DM, reel, private call, or any
-- unrelated live room would still add to PK score if the
-- receiver happened to be in an active PK battle.
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_pk_gift_scoring()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _active_battle RECORD;
BEGIN
  -- Only live-stream gifts can affect PK score.
  IF NEW.stream_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Coin amount must be positive (defensive — DB column is bigint but
  -- a negative would otherwise *decrease* the rival's score in client SUMs).
  IF COALESCE(NEW.coin_amount, 0) <= 0 THEN
    RETURN NEW;
  END IF;

  -- Find an active battle that
  --   (a) has the receiver as one of its two hosts AND
  --   (b) whose stream pair matches the live room the gift was sent in.
  SELECT * INTO _active_battle
  FROM public.pk_battles
  WHERE status = 'active'
    AND (host1_id = NEW.receiver_id OR host2_id = NEW.receiver_id)
    AND (stream1_id = NEW.stream_id OR stream2_id = NEW.stream_id)
  ORDER BY started_at DESC NULLS LAST
  LIMIT 1;

  IF _active_battle.id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Defensive: receiver must really be a host of THIS battle
  IF NEW.receiver_id NOT IN (_active_battle.host1_id, _active_battle.host2_id) THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.pk_battle_gifts (
    battle_id, sender_id, target_host_id, gift_id, coin_amount, receiver_id
  ) VALUES (
    _active_battle.id, NEW.sender_id, NEW.receiver_id,
    NEW.gift_id, NEW.coin_amount, NEW.receiver_id
  );

  IF _active_battle.host1_id = NEW.receiver_id THEN
    UPDATE public.pk_battles
       SET host1_score = COALESCE(host1_score,0) + NEW.coin_amount
     WHERE id = _active_battle.id;
  ELSE
    UPDATE public.pk_battles
       SET host2_score = COALESCE(host2_score,0) + NEW.coin_amount
     WHERE id = _active_battle.id;
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Never break the gift transaction because of PK accounting.
  RETURN NEW;
END;
$function$;

-- ============================================================
-- FIX 3: Drop redundant `public_read` (true) policy on gifts.
-- It exposed inactive / unreleased / admin-only gifts.
-- public_read_active_gifts_v2 (is_active=true) covers the real UX.
-- ============================================================
DROP POLICY IF EXISTS "public_read" ON public.gifts;

-- ============================================================
-- FIX 4: Sanity check constraints on gifts economic fields.
-- Prevents admin typo from creating a negative-cost gift (free coins drain)
-- or a negative receiver_beans (which would *subtract* host earnings).
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.gifts'::regclass
      AND conname = 'gifts_coin_value_nonneg'
  ) THEN
    ALTER TABLE public.gifts
      ADD CONSTRAINT gifts_coin_value_nonneg CHECK (coin_value >= 0) NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.gifts'::regclass
      AND conname = 'gifts_receiver_beans_nonneg'
  ) THEN
    ALTER TABLE public.gifts
      ADD CONSTRAINT gifts_receiver_beans_nonneg
      CHECK (COALESCE(receiver_beans, 0) >= 0) NOT VALID;
  END IF;
END$$;

-- ============================================================
-- FIX 5: Lock the gift row in process_gift_transaction to prevent
-- a concurrent admin UPDATE from changing coin_value / receiver_beans
-- after the cost is read but before the transaction commits.
-- All other logic preserved.
-- ============================================================
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
  _total_cost integer;
  _sender_balance integer;
  _new_sender_balance integer;
  _beans_amount integer := 0;
  _credit_percent numeric;
  _transaction_id uuid;
  _qty integer;
BEGIN
  _qty := GREATEST(1, COALESCE(p_quantity, 1));

  IF p_sender_id IS NULL OR p_receiver_id IS NULL OR p_gift_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Missing required arguments');
  END IF;
  IF p_sender_id = p_receiver_id THEN
    RETURN json_build_object('success', false, 'error', 'Cannot send gift to self');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_receiver_id) THEN
    RETURN json_build_object('success', false, 'error', 'Receiver not found');
  END IF;

  -- LOCK gift row for the duration of the tx
  SELECT id, name, coin_value, icon_url, animation_url, receiver_beans
    INTO _gift
  FROM public.gifts
   WHERE id = p_gift_id AND is_active = true
   FOR SHARE;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Gift not found');
  END IF;

  IF _gift.coin_value IS NULL OR _gift.coin_value < 0 THEN
    RETURN json_build_object('success', false, 'error', 'Invalid gift price');
  END IF;

  _total_cost := _gift.coin_value * _qty;

  SELECT coins INTO _sender_balance FROM public.profiles WHERE id = p_sender_id FOR UPDATE;
  IF _sender_balance IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Sender not found');
  END IF;
  IF _sender_balance < _total_cost THEN
    RETURN json_build_object('success', false, 'error', 'Insufficient diamonds');
  END IF;

  IF _gift.receiver_beans IS NOT NULL AND _gift.receiver_beans > 0 THEN
    _beans_amount := _gift.receiver_beans * _qty;
    _credit_percent := NULL;
  ELSE
    _credit_percent := public.get_effective_host_percent();
    IF _credit_percent IS NULL OR _credit_percent < 0 OR _credit_percent > 100 THEN
      RETURN json_build_object('success', false,
        'error', 'Gift commission is not configured. Admin must set gift_commission.host_percent.');
    END IF;
    _beans_amount := FLOOR(_total_cost::numeric * _credit_percent / 100)::integer;
  END IF;

  PERFORM set_config('app.bypass_profile_protection', 'true', true);

  _new_sender_balance := _sender_balance - _total_cost;
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
    'new_sender_balance', _new_sender_balance
  );
END;
$function$;
