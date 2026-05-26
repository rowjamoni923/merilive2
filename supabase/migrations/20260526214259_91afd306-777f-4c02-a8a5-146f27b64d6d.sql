-- Pkg372: restore separate user vs agency beans→diamonds exchange rules
-- User: 100 beans -> 25 diamonds (rate 4, fee 0%)
-- Agency: 100 beans -> 75 diamonds (gross rate 1, fee 25% deducted from diamonds)

INSERT INTO public.app_settings (setting_key, setting_value, description)
VALUES (
  'coin_exchange',
  jsonb_build_object('beans_to_diamonds_rate', 4, 'exchange_fee_percent', 0, 'min_exchange_amount', 100000),
  'User beans → diamonds exchange (100 beans → 25 diamonds, no fee)'
)
ON CONFLICT (setting_key) DO UPDATE
SET setting_value = EXCLUDED.setting_value,
    description = EXCLUDED.description;

INSERT INTO public.app_settings (setting_key, setting_value, description)
VALUES (
  'agency_coin_exchange',
  jsonb_build_object('beans_to_diamonds_rate', 1, 'exchange_fee_percent', 25, 'min_exchange_amount', 100000),
  'Agency beans → diamonds exchange (100 beans → 75 diamonds after 25% fee)'
)
ON CONFLICT (setting_key) DO UPDATE
SET setting_value = EXCLUDED.setting_value,
    description = EXCLUDED.description;

CREATE OR REPLACE FUNCTION public.exchange_user_beans_to_diamonds(
  _user_id uuid, _beans_amount integer, _diamonds_reward integer, _tier_id uuid DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _current_beans INTEGER;
  _current_diamonds INTEGER;
  _is_host BOOLEAN;
  _is_agency_owner BOOLEAN;
  _agency_id UUID;
  _helper_id UUID;
  _helper_level INTEGER;
  _payroll_enabled BOOLEAN;
  _destination TEXT := 'my_diamonds';
  _exchange_rate NUMERIC;
  _expected_diamonds INTEGER;
  _tier RECORD;
  _settings jsonb;
  _settings_key text;
  _rate numeric;
  _fee numeric;
  _min integer;
  _gross_diamonds integer;
  _fee_diamonds integer;
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
    SELECT th.id, th.trader_level, th.payroll_enabled
      INTO _helper_id, _helper_level, _payroll_enabled
      FROM topup_helpers th WHERE th.user_id = _user_id AND th.is_active = true LIMIT 1;
    IF _helper_id IS NULL THEN
      RETURN json_build_object('success', false, 'error', 'Hosts cannot exchange beans');
    END IF;
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
      _beans_amount::NUMERIC
      * _tier.exchange_rate
      * (1 + COALESCE(_tier.bonus_percent, 0) / 100.0)
    )::INTEGER;
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

  _exchange_rate := ROUND((_diamonds_reward::NUMERIC / _beans_amount::NUMERIC), 4);

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
           total_coins_sold = COALESCE(total_coins_sold, 0) + _diamonds_reward,
           updated_at = now()
     WHERE id = _helper_id;
  ELSE
    UPDATE profiles SET coins = coins + _diamonds_reward WHERE id = _user_id;
  END IF;

  INSERT INTO public.user_beans_exchanges(
    user_id, beans_amount, diamonds_reward, exchange_rate, tier_id, status, completed_at
  ) VALUES (
    _user_id, _beans_amount, _diamonds_reward, _exchange_rate, _tier_id, 'completed', now()
  );

  INSERT INTO public.coin_transactions(user_id, transaction_type, amount, description, reference_type, status)
  VALUES (
    _user_id,
    'exchange',
    _diamonds_reward,
    CASE
      WHEN _destination = 'trader_wallet_agency' THEN 'Agency exchange: beans converted to agency diamonds'
      WHEN _destination = 'trader_wallet_helper' THEN 'Helper wallet exchange: beans converted to helper wallet'
      ELSE 'Beans converted to diamonds'
    END,
    'beans_exchange',
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
    'fee_diamonds', COALESCE(_fee_diamonds, 0)
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.exchange_user_beans_to_diamonds(uuid, integer, integer, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.exchange_user_beans_to_diamonds(uuid, integer, integer, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.process_user_beans_exchange(p_amount integer)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_settings jsonb;
  v_rate numeric;
  v_fee  numeric;
  v_min  integer;
  v_gross integer;
  v_fee_diamonds integer;
  v_dmd integer;
BEGIN
  IF v_user IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Not authenticated');
  END IF;
  IF p_amount IS NULL OR p_amount < 1 THEN
    RETURN json_build_object('success', false, 'error', 'Invalid amount');
  END IF;

  SELECT setting_value INTO v_settings
  FROM public.app_settings
  WHERE setting_key = 'coin_exchange'
  LIMIT 1;

  IF v_settings IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Exchange settings are not configured');
  END IF;

  v_rate := COALESCE(NULLIF((v_settings->>'beans_to_diamonds_rate'), '')::numeric, 0);
  v_fee  := COALESCE(NULLIF((v_settings->>'exchange_fee_percent'), '')::numeric, 0);
  v_min  := COALESCE(NULLIF((v_settings->>'min_exchange_amount'), '')::integer, 0);

  IF v_rate <= 0 THEN
    RETURN json_build_object('success', false, 'error', 'Exchange rate is not configured');
  END IF;
  IF v_min > 0 AND p_amount < v_min THEN
    RETURN json_build_object('success', false, 'error', format('Minimum exchange is %s beans', v_min));
  END IF;

  v_gross := floor(p_amount::numeric / v_rate)::integer;
  v_fee_diamonds := floor(v_gross::numeric * GREATEST(v_fee, 0) / 100.0)::integer;
  v_dmd := GREATEST(v_gross - v_fee_diamonds, 0);

  IF v_dmd < 1 THEN
    RETURN json_build_object('success', false, 'error', 'Amount too small for any diamonds');
  END IF;

  RETURN public.exchange_user_beans_to_diamonds(v_user, p_amount, v_dmd, NULL);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.process_user_beans_exchange(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.process_user_beans_exchange(integer) TO authenticated;