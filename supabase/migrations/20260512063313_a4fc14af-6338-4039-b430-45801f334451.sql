-- Pkg33: Reels gift accuracy — single source of truth, no double credit

-- 1) Extend process_gift_transaction to accept reel context
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
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  _gift RECORD;
  _total_cost integer;
  _sender_balance integer;
  _new_sender_balance integer;
  _beans_amount integer := 0;
  _credit_percent numeric;
  _transaction_id uuid;
  _receiver_is_host boolean := false;
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

  SELECT (is_host = true AND lower(COALESCE(host_status::text, '')) = 'approved')
  INTO _receiver_is_host
  FROM public.profiles WHERE id = p_receiver_id;

  SELECT id, name, coin_value, icon_url, animation_url, receiver_beans INTO _gift
  FROM public.gifts WHERE id = p_gift_id AND is_active = true;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Gift not found');
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
  ELSIF _receiver_is_host THEN
    _credit_percent := public.get_effective_host_percent();
    IF _credit_percent IS NULL OR _credit_percent < 0 OR _credit_percent > 100 THEN
      RETURN json_build_object('success', false,
        'error', 'Gift host commission is not configured. Admin must set gift_commission.host_percent.');
    END IF;
    _beans_amount := FLOOR(_total_cost::numeric * _credit_percent / 100)::integer;
  ELSE
    _credit_percent := public.get_effective_user_receiver_percent();
    IF _credit_percent IS NULL OR _credit_percent < 0 OR _credit_percent > 100 THEN
      RETURN json_build_object('success', false,
        'error', 'Gift receiver commission is not configured. Admin must set gift_commission.');
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
    IF _receiver_is_host THEN
      UPDATE public.profiles
         SET beans = COALESCE(beans, 0) + _beans_amount,
             total_earnings = COALESCE(total_earnings, 0) + _beans_amount,
             weekly_earnings = COALESCE(weekly_earnings, 0) + _beans_amount,
             pending_earnings = COALESCE(pending_earnings, 0) + _beans_amount
       WHERE id = p_receiver_id;
    ELSE
      UPDATE public.profiles
         SET beans = COALESCE(beans, 0) + _beans_amount,
             total_earnings = COALESCE(total_earnings, 0) + _beans_amount
       WHERE id = p_receiver_id;
    END IF;
  END IF;

  INSERT INTO public.gift_transactions (
    gift_id, sender_id, receiver_id, stream_id, party_room_id, call_id, reel_id,
    coin_amount, coin_cost, quantity, receiver_beans
  ) VALUES (
    p_gift_id, p_sender_id, p_receiver_id, p_stream_id, p_party_room_id, p_call_id, p_reel_id,
    _total_cost, _total_cost, _qty, _beans_amount
  ) RETURNING id INTO _transaction_id;

  RETURN json_build_object(
    'success', true,
    'transaction_id', _transaction_id,
    'coins_spent', _total_cost,
    'beans_earned', _beans_amount,
    'host_percent', _credit_percent,
    'receiver_is_host', _receiver_is_host,
    'gift_name', _gift.name,
    'gift_icon_url', _gift.icon_url,
    'gift_animation_url', _gift.animation_url
  );
END;
$function$;

-- 2) Fix handle_reel_gift: only update reel counter, NEVER touch profile beans (process_gift_transaction already did)
CREATE OR REPLACE FUNCTION public.handle_reel_gift()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.reel_id IS NOT NULL THEN
    -- Display counter on reel = beans actually credited to receiver (single source of truth)
    UPDATE public.reels
       SET beans_earned = COALESCE(beans_earned, 0) + COALESCE(NEW.receiver_beans, 0)
     WHERE id = NEW.reel_id;
  END IF;
  RETURN NEW;
END;
$function$;