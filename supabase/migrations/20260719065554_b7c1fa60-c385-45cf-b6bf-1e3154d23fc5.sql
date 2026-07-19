CREATE OR REPLACE FUNCTION public.exchange_user_beans_to_diamonds(_user_id uuid, _beans_amount integer, _diamonds_reward integer, _tier_id uuid DEFAULT NULL::uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _current_beans integer;
  _current_diamonds integer;
  _is_host boolean;
  _is_agency_owner boolean;
  _helper_id uuid;
  _helper_level integer;
  _payroll_enabled boolean;
  _helper_balance_before bigint;
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

  SELECT beans, diamonds, is_host, is_agency_owner
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

  SELECT th.id, th.trader_level, th.payroll_enabled, COALESCE(th.wallet_balance, 0)
    INTO _helper_id, _helper_level, _payroll_enabled, _helper_balance_before
    FROM topup_helpers th
   WHERE th.user_id = _user_id AND th.is_active = true
   LIMIT 1;

  IF _is_agency_owner = true THEN
    _destination := 'trader_wallet_agency';
  ELSIF _helper_id IS NOT NULL
     AND ((_helper_level BETWEEN 1 AND 4) OR _payroll_enabled = true OR _helper_level = 5) THEN
    _destination := 'trader_wallet_helper';
  ELSE
    _destination := 'my_diamonds';
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
    IF _is_agency_owner = true THEN
      SELECT setting_value INTO _settings FROM public.app_settings
        WHERE setting_key = 'agency_coin_exchange' LIMIT 1;
      IF _settings IS NOT NULL THEN
        _settings_key := 'agency_coin_exchange';
      END IF;
    END IF;

    IF _settings IS NULL THEN
      SELECT setting_value INTO _settings FROM public.app_settings
        WHERE setting_key = 'coin_exchange' LIMIT 1;
      _settings_key := 'coin_exchange';
    END IF;

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

  IF _destination = 'trader_wallet_helper' THEN
    UPDATE topup_helpers
       SET wallet_balance = COALESCE(wallet_balance, 0) + _diamonds_reward,
           total_sold = COALESCE(total_sold, 0) + _diamonds_reward,
           updated_at = now()
     WHERE id = _helper_id;

    INSERT INTO public.helper_transactions (
      helper_id, transaction_type, amount, balance_before, balance_after,
      reference_id, description, user_id, created_at
    ) VALUES (
      _helper_id, 'beans_exchange_credit', _diamonds_reward,
      _helper_balance_before, _helper_balance_before + _diamonds_reward,
      _user_id, 'Beans exchanged to trader (helper) wallet', _user_id, now()
    );
  ELSIF _destination = 'trader_wallet_agency' THEN
    UPDATE public.agencies
       SET diamond_balance = COALESCE(diamond_balance, 0) + _diamonds_reward,
           updated_at = now()
     WHERE owner_id = _user_id;
  ELSE
    UPDATE profiles SET diamonds = COALESCE(diamonds, 0) + _diamonds_reward WHERE id = _user_id;
  END IF;

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
      WHEN _destination = 'trader_wallet_helper' THEN 'Helper wallet exchange: beans converted to trader wallet'
      WHEN _destination = 'trader_wallet_agency' THEN 'Agency wallet exchange: beans converted to agency diamond balance'
      ELSE 'Beans converted to top-up balance'
    END,
    _payment_ref,
    'completed'
  );

  SELECT beans, diamonds INTO _current_beans, _current_diamonds FROM profiles WHERE id = _user_id;

  RETURN json_build_object(
    'success', true,
    'message', 'Exchange completed successfully',
    'new_beans', _current_beans,
    'new_diamonds', _current_diamonds,
    'diamonds_added', _diamonds_reward,
    'destination', _destination,
    'settings_key', _settings_key,
    'fee_diamonds', COALESCE(_fee_diamonds, 0),
    'exchange_id', _exchange_id
  );
END;
$function$;