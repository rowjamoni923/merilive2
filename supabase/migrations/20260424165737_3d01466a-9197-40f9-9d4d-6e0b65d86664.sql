-- Allow gifting to non-host users (e.g., DMs, chat between regular users)
-- When the receiver is NOT an approved host, the gift still goes through:
--   * sender's coins are deducted
--   * a gift_transactions row is recorded (for history and animations)
--   * NO beans are credited (only approved hosts earn beans)
CREATE OR REPLACE FUNCTION public.process_gift_transaction(
  p_sender_id uuid,
  p_receiver_id uuid,
  p_gift_id uuid,
  p_quantity integer DEFAULT 1,
  p_stream_id uuid DEFAULT NULL::uuid,
  p_party_room_id uuid DEFAULT NULL::uuid,
  p_call_id uuid DEFAULT NULL::uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _gift RECORD;
  _total_cost INTEGER;
  _sender_balance INTEGER;
  _new_sender_balance INTEGER;
  _beans_amount INTEGER := 0;
  _host_percent NUMERIC;
  _transaction_id UUID;
  _receiver_is_host BOOLEAN := false;
BEGIN
  -- Verify receiver exists at all
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = p_receiver_id) THEN
    RETURN json_build_object('success', false, 'error', 'Receiver not found');
  END IF;

  -- Check if receiver is an approved host (only they earn beans)
  SELECT (is_host = true AND host_status = 'approved')
    INTO _receiver_is_host
  FROM profiles
  WHERE id = p_receiver_id;

  SELECT id, name, coin_value, icon_url, animation_url, receiver_beans
  INTO _gift
  FROM gifts
  WHERE id = p_gift_id AND is_active = true;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Gift not found');
  END IF;

  _total_cost := _gift.coin_value * p_quantity;

  SELECT coins INTO _sender_balance FROM profiles WHERE id = p_sender_id FOR UPDATE;

  IF _sender_balance IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Sender not found');
  END IF;

  IF _sender_balance < _total_cost THEN
    RETURN json_build_object('success', false, 'error', 'Insufficient diamonds');
  END IF;

  PERFORM set_config('app.bypass_profile_protection', 'true', true);

  _new_sender_balance := _sender_balance - _total_cost;
  UPDATE profiles SET coins = _new_sender_balance WHERE id = p_sender_id;

  UPDATE profiles
  SET total_consumption = COALESCE(total_consumption, 0) + _total_cost
  WHERE id = p_sender_id;

  -- Beans only credited to approved hosts
  IF _receiver_is_host THEN
    _host_percent := public.get_effective_host_percent();
    _beans_amount := FLOOR(_total_cost * _host_percent / 100);

    IF _gift.receiver_beans IS NOT NULL AND _gift.receiver_beans > 0 THEN
      _beans_amount := _gift.receiver_beans * p_quantity;
    END IF;

    -- Credit beans to host
    UPDATE profiles
    SET beans = COALESCE(beans, 0) + _beans_amount,
        total_earnings = COALESCE(total_earnings, 0) + _beans_amount,
        weekly_earnings = COALESCE(weekly_earnings, 0) + _beans_amount
    WHERE id = p_receiver_id;
  ELSE
    _beans_amount := 0;
  END IF;

  INSERT INTO gift_transactions (
    gift_id, sender_id, receiver_id, stream_id, room_id,
    coin_amount, coin_cost, quantity, receiver_beans
  ) VALUES (
    p_gift_id, p_sender_id, p_receiver_id, p_stream_id, p_party_room_id,
    _total_cost, _total_cost, p_quantity, _beans_amount
  ) RETURNING id INTO _transaction_id;

  RETURN json_build_object(
    'success', true,
    'transaction_id', _transaction_id,
    'coins_spent', _total_cost,
    'beans_earned', _beans_amount,
    'host_percent', COALESCE(_host_percent, 0),
    'receiver_is_host', _receiver_is_host,
    'gift_name', _gift.name,
    'gift_icon_url', _gift.icon_url,
    'gift_animation_url', _gift.animation_url
  );
END;
$function$;