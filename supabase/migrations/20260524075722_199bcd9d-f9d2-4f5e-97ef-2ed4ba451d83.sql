-- Section #9 Gift Pipeline hardening: sender binding, context validation, overflow safety, and agency accounting

-- 1) Make combo gift totals safe for high-value gifts.
ALTER TABLE public.gift_transactions
  ALTER COLUMN total_coins TYPE bigint USING total_coins::bigint,
  ALTER COLUMN diamond_cost TYPE bigint USING diamond_cost::bigint;

-- 2) Tighten future gift/economy rows. NOT VALID avoids breaking legacy rows but enforces new writes.
ALTER TABLE public.gift_transactions DROP CONSTRAINT IF EXISTS check_positive_coin_amount;
ALTER TABLE public.gift_transactions DROP CONSTRAINT IF EXISTS check_positive_quantity;
ALTER TABLE public.gift_transactions
  ADD CONSTRAINT gift_transactions_coin_amount_positive CHECK (coin_amount > 0) NOT VALID,
  ADD CONSTRAINT gift_transactions_quantity_positive CHECK (quantity > 0) NOT VALID,
  ADD CONSTRAINT gift_transactions_receiver_beans_nonneg CHECK (COALESCE(receiver_beans, 0) >= 0) NOT VALID,
  ADD CONSTRAINT gift_transactions_total_coins_nonneg CHECK (COALESCE(total_coins, 0) >= 0) NOT VALID;

ALTER TABLE public.gifts DROP CONSTRAINT IF EXISTS gifts_coin_value_nonneg;
ALTER TABLE public.gifts DROP CONSTRAINT IF EXISTS gifts_receiver_beans_nonneg;
ALTER TABLE public.gifts
  ADD CONSTRAINT gifts_coin_value_positive CHECK (coin_value > 0) NOT VALID,
  ADD CONSTRAINT gifts_receiver_beans_nonneg CHECK (COALESCE(receiver_beans, 0) >= 0) NOT VALID,
  ADD CONSTRAINT gifts_receiver_beans_not_over_price CHECK (COALESCE(receiver_beans, 0) <= coin_value) NOT VALID;

-- 3) Replace gift processing with auth-bound, context-bound, bigint-safe logic.
CREATE OR REPLACE FUNCTION public.process_gift_transaction(
  p_sender_id uuid,
  p_receiver_id uuid,
  p_gift_id uuid,
  p_quantity integer DEFAULT 1,
  p_stream_id uuid DEFAULT NULL::uuid,
  p_party_room_id uuid DEFAULT NULL::uuid,
  p_call_id uuid DEFAULT NULL::uuid,
  p_reel_id uuid DEFAULT NULL::uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _gift RECORD;
  _total_cost bigint;
  _sender_balance bigint;
  _new_sender_balance bigint;
  _beans_amount bigint := 0;
  _credit_percent numeric;
  _transaction_id uuid;
  _qty integer;
  _context_count integer;
  _sender RECORD;
  _receiver_exists boolean;
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

  SELECT id, COALESCE(coins, 0)::bigint AS coins, COALESCE(is_blocked, false) AS is_blocked
    INTO _sender
  FROM public.profiles
  WHERE id = p_sender_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Sender not found');
  END IF;

  IF _sender.is_blocked THEN
    RETURN json_build_object('success', false, 'error', 'Sender is blocked');
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = p_receiver_id AND COALESCE(is_blocked, false) = false
  ) INTO _receiver_exists;
  IF NOT _receiver_exists THEN
    RETURN json_build_object('success', false, 'error', 'Receiver not found');
  END IF;

  SELECT id, name, coin_value::bigint AS coin_value, icon_url, animation_url, COALESCE(receiver_beans, 0)::bigint AS receiver_beans
    INTO _gift
  FROM public.gifts
  WHERE id = p_gift_id AND COALESCE(is_active, true) = true
  FOR SHARE;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Gift not found');
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

REVOKE ALL ON FUNCTION public.process_gift_transaction(uuid, uuid, uuid, integer, uuid, uuid, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.process_gift_transaction(uuid, uuid, uuid, integer, uuid, uuid, uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.process_gift_transaction(uuid, uuid, uuid, integer, uuid, uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.process_gift_transaction(uuid, uuid, uuid, integer, uuid, uuid, uuid, uuid) TO service_role;

-- 4) Agency performance must follow actual credited receiver_beans, not a separate estimated percentage.
CREATE OR REPLACE FUNCTION public.update_agency_performance_on_gift()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _host_agency_id uuid;
  _period_start date;
  _beans_per_dollar numeric;
  _usd_amount numeric;
BEGIN
  IF COALESCE(NEW.receiver_beans, 0) <= 0 THEN
    RETURN NEW;
  END IF;

  SELECT agency_id INTO _host_agency_id
  FROM public.profiles
  WHERE id = NEW.receiver_id;

  IF _host_agency_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE((setting_value::text)::numeric, 9000) INTO _beans_per_dollar
  FROM public.app_settings WHERE setting_key = 'beans_per_dollar';
  IF _beans_per_dollar IS NULL OR _beans_per_dollar <= 0 THEN
    _beans_per_dollar := 9000;
  END IF;

  _usd_amount := ROUND(COALESCE(NEW.receiver_beans, 0)::numeric / _beans_per_dollar, 2);
  IF _usd_amount <= 0 THEN
    RETURN NEW;
  END IF;

  _period_start := date_trunc('week', CURRENT_DATE)::date;

  INSERT INTO public.agency_performance (agency_id, period_type, period_start, total_income, golden_host_income)
  VALUES (_host_agency_id, 'weekly', _period_start, _usd_amount, _usd_amount)
  ON CONFLICT (agency_id, period_type, period_start)
  DO UPDATE SET
    total_income = agency_performance.total_income + _usd_amount,
    golden_host_income = agency_performance.golden_host_income + _usd_amount,
    updated_at = now();

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS on_gift_transaction_agency_performance ON public.gift_transactions;
CREATE TRIGGER on_gift_transaction_agency_performance
  AFTER INSERT ON public.gift_transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_agency_performance_on_gift();