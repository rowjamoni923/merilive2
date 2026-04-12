
-- 1. Create process_gift_transaction RPC (atomic gift sending)
CREATE OR REPLACE FUNCTION public.process_gift_transaction(
  p_sender_id uuid,
  p_receiver_id uuid,
  p_gift_id uuid,
  p_quantity integer DEFAULT 1,
  p_stream_id uuid DEFAULT NULL,
  p_party_room_id uuid DEFAULT NULL,
  p_call_id uuid DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _gift RECORD;
  _total_cost INTEGER;
  _sender_balance INTEGER;
  _new_sender_balance INTEGER;
  _beans_amount INTEGER;
  _host_percent NUMERIC;
  _transaction_id UUID;
BEGIN
  -- Get gift info
  SELECT id, name, coin_value, icon_url, animation_url, receiver_beans
  INTO _gift
  FROM gifts
  WHERE id = p_gift_id AND is_active = true;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Gift not found');
  END IF;

  _total_cost := _gift.coin_value * p_quantity;

  -- Lock sender row and check balance
  SELECT coins INTO _sender_balance
  FROM profiles
  WHERE id = p_sender_id
  FOR UPDATE;

  IF _sender_balance IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Sender not found');
  END IF;

  IF _sender_balance < _total_cost THEN
    RETURN json_build_object('success', false, 'error', 'Insufficient diamonds');
  END IF;

  -- Bypass protection trigger
  PERFORM set_config('app.bypass_profile_protection', 'true', true);

  -- Deduct diamonds from sender
  _new_sender_balance := _sender_balance - _total_cost;
  UPDATE profiles SET coins = _new_sender_balance WHERE id = p_sender_id;

  -- Update sender total_consumption for level tracking
  UPDATE profiles
  SET total_consumption = COALESCE(total_consumption, 0) + _total_cost
  WHERE id = p_sender_id;

  -- Calculate beans for receiver
  _host_percent := public.get_effective_host_percent();
  _beans_amount := FLOOR(_total_cost * _host_percent / 100);

  -- If gift has custom receiver_beans, use that instead
  IF _gift.receiver_beans IS NOT NULL AND _gift.receiver_beans > 0 THEN
    _beans_amount := _gift.receiver_beans * p_quantity;
  END IF;

  -- Insert gift transaction (triggers handle weekly earnings, agency commission, notifications)
  INSERT INTO gift_transactions (
    gift_id, sender_id, receiver_id, stream_id, room_id,
    coin_amount, coin_cost, quantity, receiver_beans
  ) VALUES (
    p_gift_id, p_sender_id, p_receiver_id, p_stream_id, p_party_room_id,
    _total_cost, _total_cost, p_quantity, _beans_amount
  ) RETURNING id INTO _transaction_id;

  -- Note: Beans credit to receiver is handled by existing triggers on gift_transactions

  RETURN json_build_object(
    'success', true,
    'transaction_id', _transaction_id,
    'coins_spent', _total_cost,
    'beans_earned', _beans_amount,
    'host_percent', _host_percent,
    'gift_name', _gift.name,
    'gift_icon_url', _gift.icon_url,
    'gift_animation_url', _gift.animation_url
  );
END;
$$;

-- 2. Fix update_host_earnings_on_gift trigger to use coin_amount instead of coin_cost
-- (coin_cost was defaulting to 0, so beans were always 0)
CREATE OR REPLACE FUNCTION public.update_host_earnings_on_gift()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  _beans_amount integer;
  _host_percent numeric;
BEGIN
  -- Use the pre-calculated receiver_beans if available, otherwise calculate
  IF NEW.receiver_beans IS NOT NULL AND NEW.receiver_beans > 0 THEN
    _beans_amount := NEW.receiver_beans;
  ELSE
    _host_percent := public.get_effective_host_percent();
    _beans_amount := FLOOR(COALESCE(NEW.coin_amount, 0) * _host_percent / 100);
  END IF;

  PERFORM set_config('app.bypass_profile_protection', 'true', true);

  UPDATE profiles
  SET beans = COALESCE(beans, 0) + _beans_amount,
      total_earnings = COALESCE(total_earnings, 0) + _beans_amount,
      pending_earnings = COALESCE(pending_earnings, 0) + _beans_amount
  WHERE id = NEW.receiver_id;

  RETURN NEW;
END;
$$;

-- 3. Create deduct_coins RPC (used by legacy LiveStream code)
CREATE OR REPLACE FUNCTION public.deduct_coins(p_user_id uuid, p_amount integer)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _current INTEGER;
  _new INTEGER;
BEGIN
  SELECT coins INTO _current FROM profiles WHERE id = p_user_id FOR UPDATE;
  IF _current IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'User not found');
  END IF;
  IF _current < p_amount THEN
    RETURN json_build_object('success', false, 'error', 'Insufficient diamonds');
  END IF;

  PERFORM set_config('app.bypass_profile_protection', 'true', true);

  _new := _current - p_amount;
  UPDATE profiles SET coins = _new WHERE id = p_user_id;

  RETURN json_build_object('success', true, 'new_balance', _new);
END;
$$;
