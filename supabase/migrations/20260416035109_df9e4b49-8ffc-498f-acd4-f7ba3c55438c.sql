DROP FUNCTION IF EXISTS public.exchange_user_beans_to_diamonds(uuid, integer, integer, uuid);

CREATE OR REPLACE FUNCTION public.exchange_user_beans_to_diamonds(
  _user_id UUID,
  _beans_amount INTEGER,
  _diamonds_reward INTEGER,
  _tier_id UUID DEFAULT NULL
)
RETURNS JSON
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
  _destination TEXT;
  _exchange_rate NUMERIC;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() != _user_id THEN
    RETURN json_build_object('success', false, 'error', 'Unauthorized');
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

  -- Calculate exchange rate (diamonds per bean)
  IF _beans_amount > 0 THEN
    _exchange_rate := ROUND((_diamonds_reward::NUMERIC / _beans_amount::NUMERIC), 4);
  ELSE
    _exchange_rate := 0;
  END IF;

  -- Determine destination based on role
  _destination := 'my_diamonds';

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

    IF _helper_id IS NOT NULL AND (
      (_helper_level IS NOT NULL AND _helper_level BETWEEN 1 AND 4)
      OR (_payroll_enabled = true)
      OR (_helper_level = 5)
    ) THEN
      _destination := 'trader_wallet_helper';
    END IF;
  END IF;

  SET LOCAL app.bypass_profile_protection = 'true';

  UPDATE profiles SET beans = beans - _beans_amount WHERE id = _user_id;

  IF _destination = 'trader_wallet_agency' THEN
    UPDATE agencies SET diamond_balance = COALESCE(diamond_balance, 0) + _diamonds_reward, updated_at = now()
    WHERE id = _agency_id;
    INSERT INTO agency_diamond_transactions (agency_id, transaction_type, beans_amount, diamond_amount, fee_amount, user_id)
    VALUES (_agency_id, 'exchange', _beans_amount, _diamonds_reward, _beans_amount - _diamonds_reward, _user_id);

  ELSIF _destination = 'trader_wallet_helper' THEN
    UPDATE topup_helpers SET wallet_balance = COALESCE(wallet_balance, 0) + _diamonds_reward, updated_at = now()
    WHERE id = _helper_id;

  ELSE
    UPDATE profiles SET coins = COALESCE(coins, 0) + _diamonds_reward WHERE id = _user_id;
  END IF;

  -- Record in exchange history WITH exchange_rate
  INSERT INTO user_beans_exchange_history (user_id, beans_amount, diamonds_received, exchange_rate, tier_id, destination_type)
  VALUES (_user_id, _beans_amount, _diamonds_reward, _exchange_rate, _tier_id, _destination)
  ON CONFLICT DO NOTHING;

  RETURN json_build_object(
    'success', true,
    'new_beans', _current_beans - _beans_amount,
    'new_diamonds', COALESCE(_current_diamonds, 0) + (CASE WHEN _destination = 'my_diamonds' THEN _diamonds_reward ELSE 0 END),
    'destination', _destination,
    'diamonds_credited', _diamonds_reward
  );
END;
$$;