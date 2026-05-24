-- Section #8 Withdrawal/Payout re-audit hardening
-- Block direct owner/client mutation of agency economy fields used by withdrawal payout.

CREATE OR REPLACE FUNCTION public.guard_agency_economy_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_service boolean := COALESCE(auth.role(), '') = 'service_role';
  v_is_admin boolean := COALESCE(public.is_admin(auth.uid()), false) OR COALESCE(public.is_active_admin_session(), false);
  v_bypass boolean := COALESCE(current_setting('app.bypass_agency_economy_guard', true), '') = 'true';
  v_changed_fields text[] := ARRAY[]::text[];
BEGIN
  IF TG_OP <> 'UPDATE' THEN
    RETURN NEW;
  END IF;

  IF NEW.wallet_balance IS DISTINCT FROM OLD.wallet_balance THEN
    v_changed_fields := array_append(v_changed_fields, 'wallet_balance');
  END IF;
  IF NEW.beans_balance IS DISTINCT FROM OLD.beans_balance THEN
    v_changed_fields := array_append(v_changed_fields, 'beans_balance');
  END IF;
  IF NEW.diamond_balance IS DISTINCT FROM OLD.diamond_balance THEN
    v_changed_fields := array_append(v_changed_fields, 'diamond_balance');
  END IF;
  IF NEW.commission_rate IS DISTINCT FROM OLD.commission_rate THEN
    v_changed_fields := array_append(v_changed_fields, 'commission_rate');
  END IF;
  IF NEW.level IS DISTINCT FROM OLD.level THEN
    v_changed_fields := array_append(v_changed_fields, 'level');
  END IF;

  IF array_length(v_changed_fields, 1) IS NULL THEN
    RETURN NEW;
  END IF;

  -- Secure backend/admin functions can opt in with app.bypass_agency_economy_guard.
  -- Service-role and admins remain allowed for support/ops corrections.
  IF v_bypass OR v_is_service OR v_is_admin THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.security_events (event_type, severity, user_id, metadata, created_at)
  VALUES (
    'blocked_agency_economy_tamper',
    'critical',
    auth.uid(),
    jsonb_build_object(
      'agency_id', OLD.id,
      'changed_fields', v_changed_fields,
      'old_wallet_balance', OLD.wallet_balance,
      'new_wallet_balance', NEW.wallet_balance,
      'old_beans_balance', OLD.beans_balance,
      'new_beans_balance', NEW.beans_balance,
      'old_diamond_balance', OLD.diamond_balance,
      'new_diamond_balance', NEW.diamond_balance
    ),
    now()
  );

  RAISE EXCEPTION 'Agency economy fields cannot be changed directly';
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_agency_economy_fields ON public.agencies;
CREATE TRIGGER trg_guard_agency_economy_fields
BEFORE UPDATE ON public.agencies
FOR EACH ROW
EXECUTE FUNCTION public.guard_agency_economy_fields();

-- Patch known secure backend RPCs/triggers that legitimately move agency balances.

CREATE OR REPLACE FUNCTION public.request_agency_withdrawal(
  p_agency_id uuid,
  p_amount numeric,
  p_payment_method text DEFAULT 'epay',
  p_payment_details jsonb DEFAULT '{}'::jsonb,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_balance numeric;
  v_owner_id uuid;
  v_withdrawal_id uuid;
  v_fee_percent numeric;
  v_effective_fee_percent numeric;
  v_helper_commission_percent numeric;
  v_fee_beans numeric;
  v_net_beans numeric;
  v_net_diamonds_to_helper numeric;
  v_beans_per_usd numeric;
  v_withdrawal_beans_per_usd numeric;
  v_net_usd numeric;
  v_min_beans_a numeric;
  v_min_beans_b numeric;
  v_min_beans_required numeric;
  v_min_usd numeric;
  v_free_limit numeric;
  v_fee_text text;
  v_helper_text text;
  v_agency_text text;
  v_withdrawal_text text;
  v_fee_json jsonb;
  v_helper_json jsonb;
  v_agency_json jsonb;
  v_withdrawal_json jsonb;
  v_is_service boolean;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid amount');
  END IF;

  SELECT owner_id, wallet_balance INTO v_owner_id, v_current_balance
  FROM public.agencies
  WHERE id = p_agency_id
  FOR UPDATE;

  IF v_owner_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Agency not found');
  END IF;

  v_is_service := COALESCE(auth.role(),'') = 'service_role';
  IF NOT v_is_service
     AND NOT public.is_admin(auth.uid())
     AND NOT public.is_active_admin_session()
     AND (auth.uid() IS NULL OR auth.uid() <> v_owner_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  IF v_current_balance < p_amount THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient balance', 'current_balance', v_current_balance);
  END IF;

  SELECT setting_value INTO v_agency_text FROM public.app_settings WHERE setting_key = 'agency_commission';
  BEGIN
    v_agency_json := v_agency_text::jsonb;
    v_beans_per_usd := (v_agency_json->>'coins_to_dollar_rate')::numeric;
    v_min_beans_b := (v_agency_json->>'min_payout')::numeric;
    v_min_usd := (v_agency_json->>'min_usd')::numeric;
  EXCEPTION WHEN OTHERS THEN
    v_beans_per_usd := NULL; v_min_beans_b := NULL; v_min_usd := NULL;
  END;

  SELECT setting_value INTO v_withdrawal_text FROM public.app_settings WHERE setting_key = 'withdrawal_settings';
  BEGIN
    v_withdrawal_json := v_withdrawal_text::jsonb;
    v_min_beans_a := (v_withdrawal_json->>'min_withdrawal')::numeric;
    v_withdrawal_beans_per_usd := (v_withdrawal_json->>'coins_to_dollar_rate')::numeric;
    v_free_limit := (v_withdrawal_json->>'free_withdrawal_limit')::numeric;
  EXCEPTION WHEN OTHERS THEN
    v_min_beans_a := NULL; v_withdrawal_beans_per_usd := NULL; v_free_limit := NULL;
  END;

  IF v_beans_per_usd IS NULL OR v_beans_per_usd <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Beans-to-USD rate not configured.');
  END IF;
  IF v_withdrawal_beans_per_usd IS NULL OR v_withdrawal_beans_per_usd <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Withdrawal beans-to-USD rate not configured.');
  END IF;
  IF v_withdrawal_beans_per_usd <> v_beans_per_usd THEN
    RETURN jsonb_build_object('success', false, 'error', 'Beans-to-USD rates are mismatched.');
  END IF;
  IF v_min_beans_a IS NULL OR v_min_beans_b IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Minimum withdrawal beans not configured.');
  END IF;
  v_min_beans_required := GREATEST(v_min_beans_a, v_min_beans_b);
  IF v_min_usd IS NULL OR v_min_usd <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Minimum withdrawal USD not configured.');
  END IF;
  IF v_free_limit IS NULL OR v_free_limit < 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Free withdrawal limit not configured.');
  END IF;
  IF p_amount < v_min_beans_required THEN
    RETURN jsonb_build_object('success', false,
      'error', format('Minimum withdrawal is %s beans', v_min_beans_required::bigint),
      'min_beans', v_min_beans_required, 'requested_beans', p_amount);
  END IF;

  SELECT setting_value INTO v_fee_text FROM public.app_settings WHERE setting_key = 'agency_withdrawal_fee';
  BEGIN
    v_fee_json := v_fee_text::jsonb;
    v_fee_percent := COALESCE((v_fee_json->>'rate')::numeric, (v_fee_json->>'percent')::numeric);
  EXCEPTION WHEN OTHERS THEN
    BEGIN v_fee_percent := v_fee_text::numeric;
    EXCEPTION WHEN OTHERS THEN v_fee_percent := NULL; END;
  END;
  IF v_fee_percent IS NULL OR v_fee_percent < 0 OR v_fee_percent > 100 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Agency withdrawal fee not configured.');
  END IF;

  SELECT setting_value INTO v_helper_text FROM public.app_settings WHERE setting_key = 'helper_diamond_commission';
  BEGIN
    v_helper_json := v_helper_text::jsonb;
    v_helper_commission_percent := COALESCE((v_helper_json->>'rate')::numeric, (v_helper_json->>'percent')::numeric);
  EXCEPTION WHEN OTHERS THEN
    BEGIN v_helper_commission_percent := v_helper_text::numeric;
    EXCEPTION WHEN OTHERS THEN v_helper_commission_percent := NULL; END;
  END;
  IF v_helper_commission_percent IS NULL OR v_helper_commission_percent < 0 OR v_helper_commission_percent > 100 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Helper diamond commission not configured.');
  END IF;

  v_effective_fee_percent := CASE WHEN p_amount <= v_free_limit THEN 0 ELSE v_fee_percent END;
  v_fee_beans := FLOOR(p_amount * v_effective_fee_percent / 100.0);
  v_net_beans := p_amount - v_fee_beans;
  v_net_diamonds_to_helper := FLOOR(p_amount * (1 - v_helper_commission_percent / 100.0));
  v_net_usd := ROUND(v_net_beans / v_beans_per_usd, 2);

  IF v_net_usd < v_min_usd THEN
    RETURN jsonb_build_object('success', false,
      'error', format('Net withdrawal must be at least $%s USD (currently $%s after fee)', v_min_usd, v_net_usd),
      'min_usd', v_min_usd, 'net_usd', v_net_usd);
  END IF;

  PERFORM set_config('app.bypass_agency_economy_guard', 'true', true);

  UPDATE public.agencies
  SET wallet_balance = wallet_balance - p_amount, updated_at = now()
  WHERE id = p_agency_id;

  INSERT INTO public.agency_withdrawals (
    agency_id, amount, payment_method, payment_details, notes, status,
    fee_percentage, net_amount_money, net_diamonds_to_helper
  ) VALUES (
    p_agency_id, p_amount, p_payment_method,
    COALESCE(p_payment_details, '{}'::jsonb)
      || jsonb_build_object(
           'configured_fee_percent', v_fee_percent,
           'effective_fee_percent', v_effective_fee_percent,
           'free_withdrawal_limit', v_free_limit,
           'fee_beans', v_fee_beans,
           'net_withdrawal_beans', v_net_beans,
           'net_withdrawal_usd', v_net_usd,
           'beans_per_usd', v_beans_per_usd,
           'helper_commission_percent', v_helper_commission_percent,
           'min_beans_enforced', v_min_beans_required,
           'min_usd_enforced', v_min_usd
         ),
    p_notes, 'pending',
    v_effective_fee_percent, v_net_usd, v_net_diamonds_to_helper
  ) RETURNING id INTO v_withdrawal_id;

  RETURN jsonb_build_object(
    'success', true,
    'withdrawal_id', v_withdrawal_id,
    'amount_beans', p_amount,
    'configured_fee_percent', v_fee_percent,
    'fee_percent', v_effective_fee_percent,
    'fee_beans', v_fee_beans,
    'net_beans', v_net_beans,
    'net_usd', v_net_usd,
    'net_diamonds_to_helper', v_net_diamonds_to_helper,
    'beans_per_usd', v_beans_per_usd
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_process_withdrawal(_withdrawal_id uuid, _status text, _notes text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _w RECORD;
  _agency_owner_id UUID;
  _helper_user_id UUID;
  _is_payroll_helper BOOLEAN;
  _refund_bucket TEXT;
  _diamond_reward bigint;
BEGIN
  IF NOT public.is_caller_admin() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  SELECT * INTO _w FROM public.agency_withdrawals WHERE id = _withdrawal_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Withdrawal not found');
  END IF;

  IF _w.status NOT IN ('pending', 'processing', 'completed', 'approved') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid status transition');
  END IF;

  IF _status = 'approved' THEN
    SELECT a.owner_id INTO _agency_owner_id FROM public.agencies a WHERE a.id = _w.agency_id;
    SELECT EXISTS(
      SELECT 1 FROM public.topup_helpers th
      WHERE th.user_id = _agency_owner_id AND th.is_verified = true AND th.payroll_enabled = true
    ) INTO _is_payroll_helper;

    IF NOT _is_payroll_helper THEN
      PERFORM set_config('app.bypass_agency_economy_guard', 'true', true);
      UPDATE public.agencies SET commission_rate = 3, level = 'A1', updated_at = NOW()
      WHERE id = _w.agency_id;
    END IF;

    _diamond_reward := COALESCE(_w.net_diamonds_to_helper, 0);
    IF _w.assigned_helper_id IS NOT NULL
       AND _w.helper_diamonds_credited = false
       AND _diamond_reward > 0 THEN
      SELECT user_id INTO _helper_user_id FROM public.topup_helpers WHERE id = _w.assigned_helper_id;

      IF _helper_user_id IS NOT NULL THEN
        PERFORM set_config('app.bypass_profile_protection', 'true', true);
        UPDATE public.profiles
        SET coins    = COALESCE(coins, 0)    + _diamond_reward,
            diamonds = COALESCE(diamonds, 0) + _diamond_reward
        WHERE id = _helper_user_id;
        PERFORM set_config('app.bypass_profile_protection', 'false', true);

        INSERT INTO public.notifications (user_id, type, title, message, data)
        VALUES (
          _helper_user_id,
          'payroll_diamond_reward',
          '💎 Diamond Reward Credited!',
          'You received ' || _diamond_reward || ' diamonds for completing an agency withdrawal.',
          jsonb_build_object('withdrawal_id', _withdrawal_id, 'diamonds', _diamond_reward)
        );
      END IF;

      UPDATE public.agency_withdrawals
      SET status                   = 'approved',
          notes                    = COALESCE(_notes, notes),
          processed_at             = NOW(),
          processed_by             = auth.uid(),
          helper_diamonds_credited = true,
          updated_at               = now()
      WHERE id = _withdrawal_id;
    ELSE
      UPDATE public.agency_withdrawals
      SET status       = 'approved',
          notes        = COALESCE(_notes, notes),
          processed_at = COALESCE(processed_at, NOW()),
          processed_by = COALESCE(processed_by, auth.uid()),
          updated_at   = now()
      WHERE id = _withdrawal_id;
    END IF;

    IF _agency_owner_id IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, type, title, message, data)
      VALUES (
        _agency_owner_id,
        'withdrawal_approved',
        '✅ Withdrawal Approved!',
        'Your withdrawal of ' || _w.amount::TEXT || ' beans has been approved and paid.',
        jsonb_build_object('withdrawal_id', _withdrawal_id, 'amount', _w.amount)
      );
    END IF;

    RETURN jsonb_build_object(
      'success', true,
      'message', 'Withdrawal approved',
      'diamonds_given', CASE WHEN _w.helper_diamonds_credited THEN 0 ELSE _diamond_reward END
    );

  ELSIF _status = 'rejected' THEN
    UPDATE public.agency_withdrawals
    SET status = 'rejected', notes = _notes, processed_at = NOW(), processed_by = auth.uid(), updated_at = now()
    WHERE id = _withdrawal_id;

    _refund_bucket := COALESCE(_w.payment_details->>'source_balance_bucket', 'wallet_balance');
    PERFORM set_config('app.bypass_agency_economy_guard', 'true', true);
    IF _refund_bucket = 'beans_balance' THEN
      UPDATE public.agencies SET beans_balance = COALESCE(beans_balance, 0) + _w.amount, updated_at = NOW()
      WHERE id = _w.agency_id;
    ELSE
      UPDATE public.agencies SET wallet_balance = COALESCE(wallet_balance, 0) + _w.amount, updated_at = NOW()
      WHERE id = _w.agency_id;
    END IF;

    SELECT a.owner_id INTO _agency_owner_id FROM public.agencies a WHERE a.id = _w.agency_id;
    IF _agency_owner_id IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, type, title, message, data)
      VALUES (
        _agency_owner_id,
        'withdrawal_rejected',
        '❌ Withdrawal Rejected',
        'Your withdrawal of ' || _w.amount::TEXT || ' beans has been refunded.',
        jsonb_build_object('withdrawal_id', _withdrawal_id, 'amount', _w.amount, 'notes', _notes, 'refund_bucket', _refund_bucket)
      );
    END IF;

    RETURN jsonb_build_object('success', true, 'message', 'Withdrawal rejected');
  ELSE
    RETURN jsonb_build_object('success', false, 'error', 'Unsupported status: ' || _status);
  END IF;
END;
$$;

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
  _destination TEXT;
  _exchange_rate NUMERIC;
  _expected_diamonds INTEGER;
  _tier RECORD;
  _settings_text text;
  _settings_json jsonb;
  _rate numeric;
  _fee numeric;
  _min integer;
  _fee_beans integer;
  _after_fee integer;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> _user_id THEN
    RETURN json_build_object('success', false, 'error', 'Unauthorized');
  END IF;
  IF _beans_amount <= 0 OR _diamonds_reward <= 0 THEN
    RETURN json_build_object('success', false, 'error', 'Invalid amounts');
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
  ELSE
    SELECT setting_value INTO _settings_text FROM app_settings WHERE setting_key = 'coin_exchange' LIMIT 1;
    IF _settings_text IS NULL OR btrim(_settings_text) = '' THEN
      RETURN json_build_object('success', false, 'error', 'Exchange settings not configured');
    END IF;
    BEGIN
      _settings_json := _settings_text::jsonb;
    EXCEPTION WHEN OTHERS THEN
      RETURN json_build_object('success', false, 'error', 'Exchange settings invalid');
    END;
    _rate := COALESCE((_settings_json->>'beans_to_diamonds_rate')::numeric, 0);
    _fee  := COALESCE((_settings_json->>'exchange_fee_percent')::numeric, 0);
    _min  := COALESCE((_settings_json->>'min_exchange_amount')::integer, 0);
    IF _rate <= 0 THEN
      RETURN json_build_object('success', false, 'error', 'Exchange rate not configured');
    END IF;
    IF _min > 0 AND _beans_amount < _min THEN
      RETURN json_build_object('success', false, 'error', format('Minimum exchange is %s beans', _min));
    END IF;
    _fee_beans := FLOOR(_beans_amount * _fee / 100.0)::integer;
    _after_fee := _beans_amount - _fee_beans;
    _expected_diamonds := FLOOR(_after_fee / _rate)::integer;
  END IF;

  IF _expected_diamonds <> _diamonds_reward THEN
    RETURN json_build_object('success', false, 'error', 'Exchange rate mismatch — refresh and try again', 'expected', _expected_diamonds);
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

  _exchange_rate := ROUND((_diamonds_reward::NUMERIC / _beans_amount::NUMERIC), 4);

  _destination := 'my_diamonds';
  IF _is_agency_owner = true THEN
    SELECT id INTO _agency_id FROM agencies WHERE owner_id = _user_id AND is_active = true LIMIT 1;
    IF _agency_id IS NOT NULL THEN _destination := 'trader_wallet_agency'; END IF;
  END IF;

  IF _destination = 'my_diamonds' THEN
    SELECT th.id, th.trader_level, th.payroll_enabled
      INTO _helper_id, _helper_level, _payroll_enabled
      FROM topup_helpers th WHERE th.user_id = _user_id AND th.is_active = true LIMIT 1;
    IF _helper_id IS NOT NULL AND ((_helper_level BETWEEN 1 AND 4) OR _payroll_enabled = true OR _helper_level = 5) THEN
      _destination := 'trader_wallet_helper';
    END IF;
  END IF;

  PERFORM set_config('app.bypass_profile_protection', 'true', true);

  UPDATE profiles SET beans = beans - _beans_amount WHERE id = _user_id;

  IF _destination = 'trader_wallet_agency' THEN
    PERFORM set_config('app.bypass_agency_economy_guard', 'true', true);
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

  INSERT INTO user_beans_exchange_history (user_id, beans_amount, diamonds_received, exchange_rate, tier_id, destination_type)
  VALUES (_user_id, _beans_amount, _diamonds_reward, _exchange_rate, _tier_id, _destination)
  ON CONFLICT DO NOTHING;

  RETURN json_build_object(
    'success', true,
    'new_beans', _current_beans - _beans_amount,
    'new_diamonds', COALESCE(_current_diamonds, 0) + (CASE WHEN _destination = 'my_diamonds' THEN _diamonds_reward ELSE 0 END),
    'destination', _destination,
    'diamonds_credited', _diamonds_reward,
    'exchange_rate', _exchange_rate
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.approve_agency_withdrawal(_withdrawal_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _w record;
BEGIN
  IF NOT (
    is_admin(auth.uid())
    OR is_active_admin_session()
    OR EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid() AND is_active = true)
  ) THEN
    RETURN json_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  SELECT * INTO _w
  FROM agency_withdrawals
  WHERE id = _withdrawal_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Withdrawal not found');
  END IF;

  IF _w.status NOT IN ('completed', 'approved') THEN
    RETURN json_build_object('success', false, 'error', 'Withdrawal not yet processed by helper');
  END IF;

  IF _w.assigned_helper_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'No helper assigned to this withdrawal');
  END IF;

  IF _w.helper_diamonds_credited = false AND COALESCE(_w.net_diamonds_to_helper, 0) > 0 THEN
    PERFORM set_config('app.bypass_profile_protection', 'true', true);

    UPDATE profiles
    SET coins    = COALESCE(coins, 0)    + _w.net_diamonds_to_helper,
        diamonds = COALESCE(diamonds, 0) + _w.net_diamonds_to_helper
    WHERE id = (SELECT user_id FROM topup_helpers WHERE id = _w.assigned_helper_id);

    PERFORM set_config('app.bypass_profile_protection', 'false', true);

    UPDATE agency_withdrawals
    SET helper_diamonds_credited = true,
        status                   = 'approved',
        processed_at             = now(),
        processed_by             = auth.uid(),
        updated_at               = now()
    WHERE id = _withdrawal_id;

    INSERT INTO notifications (user_id, type, title, body, data)
    SELECT
      th.user_id,
      'payroll_diamond_reward',
      '💎 Diamond Reward Credited!',
      'You received ' || _w.net_diamonds_to_helper || ' diamonds for completing an agency withdrawal.',
      jsonb_build_object('withdrawal_id', _withdrawal_id, 'diamonds', _w.net_diamonds_to_helper)
    FROM topup_helpers th
    WHERE th.id = _w.assigned_helper_id;
  ELSE
    UPDATE agency_withdrawals
    SET status       = 'approved',
        processed_at = COALESCE(processed_at, now()),
        processed_by = COALESCE(processed_by, auth.uid()),
        updated_at   = now()
    WHERE id = _withdrawal_id;
  END IF;

  INSERT INTO admin_logs (admin_id, action_type, target_id, target_type, details)
  VALUES (
    auth.uid()::text,
    'approve_agency_withdrawal',
    _withdrawal_id::text,
    'withdrawal',
    jsonb_build_object(
      'amount_beans',          _w.amount,
      'diamonds_to_helper',    _w.net_diamonds_to_helper,
      'helper_id',             _w.assigned_helper_id,
      'agency_id',             _w.agency_id,
      'already_credited',      _w.helper_diamonds_credited
    )
  );

  RETURN json_build_object(
    'success', true,
    'diamonds_given', CASE WHEN _w.helper_diamonds_credited THEN 0 ELSE _w.net_diamonds_to_helper END
  );
END;
$$;

-- Tighten direct agency owner policies so owner edits must pass the economy-field guard.
DROP POLICY IF EXISTS "Owners can update own agency stats" ON public.agencies;
DROP POLICY IF EXISTS "owner_update_own_agency" ON public.agencies;

CREATE POLICY "owner_update_own_agency_safe_fields"
ON public.agencies
FOR UPDATE
TO authenticated
USING (owner_id = auth.uid())
WITH CHECK (owner_id = auth.uid());