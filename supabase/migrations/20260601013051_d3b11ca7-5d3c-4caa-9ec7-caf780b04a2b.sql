-- Pkg412: Beans→Diamonds exchange + Agency→User transfer
-- duplicate-key fix. Both RPCs were writing a CONSTANT payment_reference
-- ('beans_exchange' / _agency_id::text) which collides with the partial
-- UNIQUE INDEX uniq_coin_tx_payment_ref_completed (user_id, payment_reference)
-- WHERE status='completed' the moment the same user does a 2nd exchange or
-- receives a 2nd transfer from the same agency. Make the reference unique
-- per call by appending the new exchange/notification row's UUID.

-- ============================================================
-- 1) exchange_user_beans_to_diamonds — user + agency-owner exchange
-- ============================================================
CREATE OR REPLACE FUNCTION public.exchange_user_beans_to_diamonds(
  _user_id uuid, _beans_amount integer, _diamonds_reward integer, _tier_id uuid DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _current_beans integer;
  _current_diamonds integer;
  _is_host boolean;
  _is_agency_owner boolean;
  _agency_id uuid;
  _helper_id uuid;
  _helper_level integer;
  _payroll_enabled boolean;
  _destination text := 'my_diamonds';
  _exchange_rate numeric;
  _expected_diamonds integer;
  _tier record;
  _settings jsonb;
  _settings_key text;
  _rate numeric;
  _fee numeric;
  _min integer;
  _gross_diamonds integer;
  _fee_diamonds integer;
  _exchange_id uuid;
  _payment_ref text;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> _user_id THEN
    RETURN json_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  IF _beans_amount <= 0 OR _diamonds_reward <= 0 THEN
    RETURN json_build_object('success', false, 'error', 'Invalid amounts');
  END IF;

  SELECT beans, coins, is_host, is_agency_owner
    INTO _current_beans, _current_diamonds, _is_host, _is_agency_owner
    FROM profiles WHERE id = _user_id FOR UPDATE;

  IF _current_beans IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'User not found');
  END IF;

  IF _is_host = true AND _is_agency_owner IS NOT TRUE THEN
    RETURN json_build_object('success', false, 'error', 'Hosts are paid by weekly agency transfer');
  END IF;

  IF _current_beans < _beans_amount THEN
    RETURN json_build_object('success', false, 'error', 'Insufficient beans', 'current_beans', _current_beans);
  END IF;

  IF _is_agency_owner = true THEN
    SELECT id INTO _agency_id FROM agencies WHERE owner_id = _user_id AND is_active = true LIMIT 1;
    IF _agency_id IS NOT NULL THEN
      _destination := 'trader_wallet_agency';
    END IF;
  END IF;

  IF _destination = 'my_diamonds' THEN
    SELECT th.id, th.trader_level, th.payroll_enabled
      INTO _helper_id, _helper_level, _payroll_enabled
      FROM topup_helpers th WHERE th.user_id = _user_id AND th.is_active = true LIMIT 1;
    IF _helper_id IS NOT NULL AND ((_helper_level BETWEEN 1 AND 4) OR _payroll_enabled = true OR _helper_level = 5) THEN
      _destination := 'trader_wallet_helper';
    END IF;
  END IF;

  IF _tier_id IS NOT NULL THEN
    SELECT * INTO _tier FROM public.user_beans_exchange_tiers
     WHERE id = _tier_id AND is_active = true;
    IF _tier.id IS NULL THEN
      RETURN json_build_object('success', false, 'error', 'Invalid exchange tier');
    END IF;
    IF _beans_amount < _tier.min_beans
       OR (_tier.max_beans IS NOT NULL AND _beans_amount > _tier.max_beans) THEN
      RETURN json_build_object('success', false, 'error', 'Beans amount outside tier range');
    END IF;
    _expected_diamonds := FLOOR(
      _beans_amount::numeric
      * _tier.exchange_rate
      * (1 + COALESCE(_tier.bonus_percent, 0) / 100.0)
    )::integer;
    _fee_diamonds := 0;
    _settings_key := 'tier';
  ELSE
    _settings_key := CASE WHEN _destination = 'trader_wallet_agency' THEN 'agency_coin_exchange' ELSE 'coin_exchange' END;

    SELECT setting_value INTO _settings FROM public.app_settings WHERE setting_key = _settings_key LIMIT 1;
    IF _settings IS NULL THEN
      RETURN json_build_object('success', false, 'error', 'Exchange settings not configured');
    END IF;

    _rate := COALESCE(NULLIF((_settings->>'beans_to_diamonds_rate'), '')::numeric, 0);
    _fee  := COALESCE(NULLIF((_settings->>'exchange_fee_percent'), '')::numeric, 0);
    _min  := COALESCE(NULLIF((_settings->>'min_exchange_amount'), '')::integer, 0);

    IF _rate <= 0 THEN
      RETURN json_build_object('success', false, 'error', 'Exchange rate not configured');
    END IF;
    IF _min > 0 AND _beans_amount < _min THEN
      RETURN json_build_object('success', false, 'error', format('Minimum exchange is %s beans', _min));
    END IF;

    _gross_diamonds := FLOOR(_beans_amount::numeric / _rate)::integer;
    _fee_diamonds := FLOOR(_gross_diamonds::numeric * GREATEST(_fee, 0) / 100.0)::integer;
    _expected_diamonds := GREATEST(_gross_diamonds - _fee_diamonds, 0);
  END IF;

  IF _expected_diamonds <> _diamonds_reward THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Exchange rate mismatch — refresh and try again',
      'expected', _expected_diamonds,
      'settings_key', _settings_key
    );
  END IF;

  _exchange_rate := ROUND((_diamonds_reward::numeric / _beans_amount::numeric), 4);

  PERFORM set_config('app.bypass_profile_protection', 'true', true);

  UPDATE profiles SET beans = beans - _beans_amount WHERE id = _user_id;

  IF _destination = 'trader_wallet_agency' THEN
    PERFORM set_config('app.bypass_agency_economy_guard', 'true', true);
    UPDATE agencies SET diamond_balance = COALESCE(diamond_balance, 0) + _diamonds_reward, updated_at = now()
    WHERE id = _agency_id;

    INSERT INTO agency_diamond_transactions (
      agency_id, transaction_type, beans_amount, diamond_amount, fee_amount, description, user_id
    ) VALUES (
      _agency_id, 'exchange', _beans_amount, _diamonds_reward, COALESCE(_fee_diamonds, 0),
      'Agency owner converted personal beans to agency diamonds', _user_id
    );
  ELSIF _destination = 'trader_wallet_helper' THEN
    UPDATE topup_helpers
       SET wallet_balance = COALESCE(wallet_balance, 0) + _diamonds_reward,
           total_sold = COALESCE(total_sold, 0) + _diamonds_reward,
           updated_at = now()
     WHERE id = _helper_id;
  ELSE
    UPDATE profiles SET coins = coins + _diamonds_reward WHERE id = _user_id;
  END IF;

  -- Generate a new id up-front so we can also use it as a unique payment_reference suffix.
  _exchange_id := gen_random_uuid();
  _payment_ref := 'beans_exchange:' || _exchange_id::text;

  INSERT INTO public.user_beans_exchanges(
    id, user_id, beans_amount, diamonds_reward, exchange_rate, tier_id, status, completed_at, destination_type
  ) VALUES (
    _exchange_id, _user_id, _beans_amount, _diamonds_reward, _exchange_rate, _tier_id, 'completed', now(), _destination
  );

  INSERT INTO public.coin_transactions(user_id, transaction_type, coins_amount, notes, payment_reference, status)
  VALUES (
    _user_id,
    'exchange',
    _diamonds_reward,
    CASE
      WHEN _destination = 'trader_wallet_agency' THEN 'Agency exchange: beans converted to agency diamonds'
      WHEN _destination = 'trader_wallet_helper' THEN 'Helper wallet exchange: beans converted to trader wallet'
      ELSE 'Beans converted to top-up balance'
    END,
    _payment_ref,
    'completed'
  );

  SELECT beans, coins INTO _current_beans, _current_diamonds FROM profiles WHERE id = _user_id;

  RETURN json_build_object(
    'success', true,
    'message', 'Exchange completed successfully',
    'new_beans', _current_beans,
    'new_diamonds', _current_diamonds,
    'diamonds_added', _diamonds_reward,
    'destination', _destination,
    'agency_id', _agency_id,
    'settings_key', _settings_key,
    'fee_diamonds', COALESCE(_fee_diamonds, 0),
    'exchange_id', _exchange_id
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.exchange_user_beans_to_diamonds(uuid, integer, integer, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.exchange_user_beans_to_diamonds(uuid, integer, integer, uuid) TO authenticated;

-- ============================================================
-- 2) agency_send_diamonds_to_user — unique payment_reference per transfer
-- ============================================================
CREATE OR REPLACE FUNCTION public.agency_send_diamonds_to_user(
  _agency_id uuid,
  _receiver_id uuid,
  _amount integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_caller uuid;
  v_agency_owner_id uuid;
  v_current_balance bigint;
  v_new_user_balance bigint;
  v_agency_name text;
  v_payment_ref text;
BEGIN
  v_caller := auth.uid();
  PERFORM set_config('app.calling_function', 'agency_send_diamonds_to_user', true);
  PERFORM set_config('app.bypass_profile_protection', 'true', true);
  PERFORM set_config('app.bypass_agency_economy_guard', 'true', true);

  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  IF _amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Amount must be positive');
  END IF;

  IF v_caller = _receiver_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot transfer to yourself');
  END IF;

  SELECT owner_id, diamond_balance, name INTO v_agency_owner_id, v_current_balance, v_agency_name
  FROM public.agencies
  WHERE id = _agency_id AND COALESCE(is_active, true) = true
  FOR UPDATE;

  IF v_agency_owner_id IS NULL OR v_agency_owner_id <> v_caller THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not agency owner');
  END IF;

  v_current_balance := COALESCE(v_current_balance, 0);
  IF _amount > v_current_balance THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient diamond balance');
  END IF;

  UPDATE public.agencies
  SET diamond_balance = COALESCE(diamond_balance, 0) - _amount,
      updated_at = now()
  WHERE id = _agency_id;

  UPDATE public.profiles
  SET coins = COALESCE(coins, 0) + _amount
  WHERE id = _receiver_id
  RETURNING coins INTO v_new_user_balance;

  IF v_new_user_balance IS NULL THEN
    RAISE EXCEPTION 'Receiver not found';
  END IF;

  v_payment_ref := 'agency_transfer:' || _agency_id::text || ':' || gen_random_uuid()::text;

  INSERT INTO public.coin_transactions(user_id, coins_amount, transaction_type, status, notes, payment_reference)
  VALUES (
    _receiver_id, _amount, 'agency_transfer_in', 'completed',
    'Agency transfer credited to user top-up balance from ' || COALESCE(v_agency_name, 'Agency'),
    v_payment_ref
  );

  INSERT INTO public.notifications (user_id, type, title, message, data, is_read, created_at)
  VALUES (
    _receiver_id,
    'coins_received',
    'Top-up Balance Received',
    _amount::text || ' coins received from ' || COALESCE(v_agency_name, 'Agency'),
    jsonb_build_object('agency_id', _agency_id, 'agency_name', v_agency_name, 'amount', _amount, 'balance_bucket', 'topup_balance', 'action_url', '/recharge-history'),
    false,
    now()
  );

  RETURN jsonb_build_object(
    'success', true,
    'new_agency_balance', v_current_balance - _amount,
    'new_receiver_coins', v_new_user_balance,
    'destination', 'user_topup_balance'
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.agency_send_diamonds_to_user(uuid, uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.agency_send_diamonds_to_user(uuid, uuid, integer) TO authenticated;