CREATE OR REPLACE FUNCTION public.get_effective_user_receiver_percent()
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _raw text;
  _j jsonb;
  _p numeric;
BEGIN
  SELECT setting_value INTO _raw
  FROM public.app_settings
  WHERE setting_key = 'gift_commission'
  LIMIT 1;

  IF _raw IS NULL OR btrim(_raw) = '' THEN
    RETURN public.get_effective_host_percent();
  END IF;

  BEGIN
    _j := _raw::jsonb;
  EXCEPTION WHEN OTHERS THEN
    RETURN public.get_effective_host_percent();
  END;

  _p := (_j->>'user_receiver_percent')::numeric;
  IF _p IS NULL THEN
    _p := (_j->>'receiver_percent')::numeric;
  END IF;
  IF _p IS NULL THEN
    _p := (_j->>'user_percent')::numeric;
  END IF;

  IF _p IS NULL THEN
    RETURN public.get_effective_host_percent();
  END IF;

  IF _p < 0 OR _p > 100 THEN
    RETURN NULL;
  END IF;

  RETURN _p;
END;
$$;

COMMENT ON FUNCTION public.get_effective_user_receiver_percent() IS
'Beans % for non-host gift receivers from gift_commission JSON (user_receiver_percent, receiver_percent, user_percent); falls back to get_effective_host_percent().';

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
AS $$
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
  FROM public.profiles
  WHERE id = p_receiver_id;

  SELECT id, name, coin_value, icon_url, animation_url, receiver_beans INTO _gift
  FROM public.gifts
  WHERE id = p_gift_id
    AND is_active = true;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Gift not found');
  END IF;

  _total_cost := _gift.coin_value * _qty;

  SELECT coins INTO _sender_balance
  FROM public.profiles
  WHERE id = p_sender_id
  FOR UPDATE;

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
      RETURN json_build_object(
        'success', false,
        'error', 'Gift host commission is not configured. Admin must set gift_commission.host_percent.'
      );
    END IF;
    _beans_amount := FLOOR(_total_cost::numeric * _credit_percent / 100)::integer;
  ELSE
    _credit_percent := public.get_effective_user_receiver_percent();
    IF _credit_percent IS NULL OR _credit_percent < 0 OR _credit_percent > 100 THEN
      RETURN json_build_object(
        'success', false,
        'error', 'Gift receiver commission is not configured. Admin must set gift_commission (e.g. user_receiver_percent or host_percent).'
      );
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
    gift_id, sender_id, receiver_id, stream_id, party_room_id, call_id,
    coin_amount, coin_cost, quantity, receiver_beans
  ) VALUES (
    p_gift_id, p_sender_id, p_receiver_id, p_stream_id, p_party_room_id, p_call_id,
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
$$;

CREATE OR REPLACE FUNCTION public.start_private_call(
  p_caller_id uuid,
  p_receiver_id uuid,
  p_call_type text DEFAULT 'video'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _caller_balance integer;
  _coins_per_minute integer;
  _host_level integer;
  _call_id uuid;
  _settings_text text;
  _settings jsonb;
  _level_rates jsonb;
  _default_rate integer := 2000;
  _caller_is_live_host boolean;
  _receiver_ok boolean;
BEGIN
  IF p_caller_id IS NULL OR p_receiver_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'missing_ids');
  END IF;

  IF p_caller_id = p_receiver_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'cannot_call_self');
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = p_caller_id
      AND is_host = true
      AND lower(COALESCE(host_status, '')) = 'approved'
      AND COALESCE(is_face_verified, false) = true
  ) INTO _caller_is_live_host;

  IF _caller_is_live_host THEN
    RETURN jsonb_build_object('success', false, 'error', 'hosts_cannot_initiate_user_calls');
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = p_receiver_id
      AND is_host = true
      AND lower(COALESCE(host_status, '')) = 'approved'
      AND COALESCE(is_face_verified, false) = true
  ) INTO _receiver_ok;

  IF NOT COALESCE(_receiver_ok, false) THEN
    RETURN jsonb_build_object('success', false, 'error', 'receiver_not_callable_host');
  END IF;

  SELECT setting_value INTO _settings_text
  FROM public.app_settings
  WHERE setting_key = 'call_rates'
  LIMIT 1;

  IF _settings_text IS NOT NULL AND btrim(_settings_text) <> '' THEN
    BEGIN
      _settings := _settings_text::jsonb;
      _default_rate := COALESCE((_settings->>'default_rate')::integer, 2000);
      _level_rates := _settings->'level_rates';
    EXCEPTION WHEN OTHERS THEN
      _default_rate := 2000;
      _level_rates := NULL;
    END;
  END IF;

  SELECT COALESCE(coins, 0)::integer INTO _caller_balance
  FROM public.profiles
  WHERE id = p_caller_id;

  IF _caller_balance IS NULL OR _caller_balance < _default_rate THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Insufficient balance',
      'required', _default_rate,
      'current', COALESCE(_caller_balance, 0)
    );
  END IF;

  SELECT host_level INTO _host_level FROM public.profiles WHERE id = p_receiver_id;
  _coins_per_minute := _default_rate;

  IF _level_rates IS NOT NULL AND _host_level IS NOT NULL THEN
    DECLARE
      _rate_entry jsonb;
    BEGIN
      FOR _rate_entry IN SELECT * FROM jsonb_array_elements(_level_rates)
      LOOP
        IF (_rate_entry->>'level')::integer = _host_level THEN
          _coins_per_minute := (_rate_entry->>'rate')::integer;
          EXIT;
        END IF;
      END LOOP;
    END;
  END IF;

  INSERT INTO private_calls (caller_id, host_id, call_type, status, coins_per_minute)
  VALUES (p_caller_id, p_receiver_id, p_call_type, 'ringing', _coins_per_minute)
  RETURNING id INTO _call_id;

  UPDATE public.profiles SET is_in_call = true, current_call_id = _call_id WHERE id = p_caller_id;

  RETURN jsonb_build_object('success', true, 'call_id', _call_id, 'coins_per_minute', _coins_per_minute);
END;
$$;