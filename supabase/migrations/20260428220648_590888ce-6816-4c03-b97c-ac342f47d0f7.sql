-- Pkg31/Pricing Hub audit hardening: no hidden fallback values in commission/pricing calculations

CREATE OR REPLACE FUNCTION public.get_effective_host_percent()
RETURNS numeric
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_text text;
  v_json jsonb;
  v_percent numeric;
BEGIN
  SELECT setting_value INTO v_text
  FROM public.app_settings
  WHERE setting_key = 'gift_commission'
  LIMIT 1;

  IF v_text IS NULL OR btrim(v_text) = '' THEN
    RETURN NULL;
  END IF;

  BEGIN
    v_json := v_text::jsonb;
    v_percent := (v_json->>'host_percent')::numeric;
  EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
  END;

  IF v_percent IS NULL OR v_percent < 0 OR v_percent > 100 THEN
    RETURN NULL;
  END IF;

  RETURN v_percent;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_agency_numeric_level(_agency_id uuid)
RETURNS integer
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _code text;
  _order integer;
BEGIN
  SELECT level INTO _code FROM public.agencies WHERE id = _agency_id;

  IF _code IS NULL OR btrim(_code) = '' THEN
    RETURN NULL;
  END IF;

  IF _code ~ '^A[0-9]+$' THEN
    RETURN substring(_code from 2)::int;
  END IF;

  SELECT display_order INTO _order
  FROM public.agency_level_tiers
  WHERE level_code = _code
    AND is_active = true
  LIMIT 1;

  RETURN _order;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_rate_for_numeric_level(_level integer)
RETURNS numeric
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _rate numeric;
BEGIN
  IF _level IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT commission_rate INTO _rate
  FROM public.agency_level_tiers
  WHERE display_order = _level
    AND is_active = true
  LIMIT 1;

  IF _rate IS NULL OR _rate < 0 OR _rate > 100 THEN
    RETURN NULL;
  END IF;

  RETURN _rate;
END;
$$;

CREATE OR REPLACE FUNCTION public.resolve_agency_commission_rate(_agency_id uuid)
RETURNS numeric
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _level int;
BEGIN
  _level := public.get_agency_numeric_level(_agency_id);
  RETURN public.get_rate_for_numeric_level(_level);
END;
$$;

CREATE OR REPLACE FUNCTION public.auto_credit_agency_commission()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _host_agency_id    uuid;
  _rate              numeric;
  _commission_amount numeric;
  _host_earnings     numeric;
  _inserted_id       uuid;
BEGIN
  SELECT ah.agency_id INTO _host_agency_id
  FROM public.agency_hosts ah
  WHERE ah.host_id = NEW.receiver_id
    AND ah.status = 'active'
  LIMIT 1;

  IF _host_agency_id IS NULL THEN
    RETURN NEW;
  END IF;

  _host_earnings := COALESCE(NEW.receiver_beans, 0);
  IF _host_earnings <= 0 THEN
    RETURN NEW;
  END IF;

  _rate := public.resolve_agency_commission_rate(_host_agency_id);
  IF _rate IS NULL OR _rate < 0 OR _rate > 100 THEN
    RAISE EXCEPTION 'Agency commission tier is not configured for agency %', _host_agency_id;
  END IF;

  _commission_amount := FLOOR(_host_earnings * _rate / 100.0);
  IF _commission_amount <= 0 THEN
    RETURN NEW;
  END IF;

  PERFORM set_config('app.bypass_profile_protection', 'true', true);

  INSERT INTO public.agency_commission_history (
    agency_id, host_id, transaction_type, original_amount,
    commission_rate, commission_amount, source_transaction_id, notes
  ) VALUES (
    _host_agency_id, NEW.receiver_id, 'gift', _host_earnings,
    _rate, _commission_amount, NEW.id, 'Gift commission (admin tier)'
  )
  ON CONFLICT (source_transaction_id, transaction_type) DO NOTHING
  RETURNING id INTO _inserted_id;

  IF _inserted_id IS NULL THEN
    RETURN NEW;
  END IF;

  UPDATE public.agencies
  SET beans_balance = COALESCE(beans_balance, 0) + _commission_amount,
      updated_at = now()
  WHERE id = _host_agency_id;

  PERFORM public.credit_sub_agent_commission(
    NEW.receiver_id, _host_agency_id, _host_earnings, NEW.id, 'gift'
  );

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.auto_credit_agency_commission_from_call()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _host_agency_id    uuid;
  _rate              numeric;
  _commission_amount numeric;
  _host_earnings     numeric;
  _inserted_id       uuid;
BEGIN
  IF NEW.status NOT IN ('ended', 'completed', 'settled') OR OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  SELECT ah.agency_id INTO _host_agency_id
  FROM public.agency_hosts ah
  WHERE ah.host_id = NEW.host_id
    AND ah.status = 'active'
  LIMIT 1;

  IF _host_agency_id IS NULL THEN
    RETURN NEW;
  END IF;

  _host_earnings := COALESCE(NULLIF(NEW.host_earned, 0), NULLIF(NEW.host_earnings_amount, 0), 0);
  IF _host_earnings <= 0 THEN
    RETURN NEW;
  END IF;

  _rate := public.resolve_agency_commission_rate(_host_agency_id);
  IF _rate IS NULL OR _rate < 0 OR _rate > 100 THEN
    RAISE EXCEPTION 'Agency commission tier is not configured for agency %', _host_agency_id;
  END IF;

  _commission_amount := FLOOR(_host_earnings * _rate / 100.0);
  IF _commission_amount <= 0 THEN
    RETURN NEW;
  END IF;

  PERFORM set_config('app.bypass_profile_protection', 'true', true);

  INSERT INTO public.agency_commission_history (
    agency_id, host_id, transaction_type, original_amount,
    commission_rate, commission_amount, source_transaction_id, notes
  ) VALUES (
    _host_agency_id, NEW.host_id, 'call', _host_earnings,
    _rate, _commission_amount, NEW.id,
    'Call commission (admin tier, duration: ' || COALESCE(NEW.duration_seconds, 0) || 's)'
  )
  ON CONFLICT (source_transaction_id, transaction_type) DO NOTHING
  RETURNING id INTO _inserted_id;

  IF _inserted_id IS NULL THEN
    RETURN NEW;
  END IF;

  UPDATE public.agencies
  SET beans_balance = COALESCE(beans_balance, 0) + _commission_amount,
      updated_at = now()
  WHERE id = _host_agency_id;

  PERFORM public.credit_sub_agent_commission(
    NEW.host_id, _host_agency_id, _host_earnings, NEW.id, 'call'
  );

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.credit_sub_agent_commission(_host_id uuid, _agency_id uuid, _host_earnings numeric, _source_id uuid, _source_type text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _parent_agency_id uuid;
  _sub_level int;
  _upper_level int;
  _sub_rate numeric;
  _upper_rate numeric;
  _bonus_rate numeric;
  _bonus_beans bigint;
BEGIN
  IF _host_earnings IS NULL OR _host_earnings <= 0 THEN
    RETURN;
  END IF;

  SELECT parent_agency_id INTO _parent_agency_id
  FROM public.agencies
  WHERE id = _agency_id;

  IF _parent_agency_id IS NULL THEN
    RETURN;
  END IF;

  _sub_level := public.get_agency_numeric_level(_agency_id);
  _upper_level := public.get_agency_numeric_level(_parent_agency_id);

  IF _sub_level IS NULL OR _upper_level IS NULL THEN
    RAISE EXCEPTION 'Sub-agency level configuration is missing';
  END IF;

  IF _upper_level <= _sub_level THEN
    RETURN;
  END IF;

  _sub_rate := public.get_rate_for_numeric_level(_sub_level);
  _upper_rate := public.get_rate_for_numeric_level(_upper_level);

  IF _sub_rate IS NULL OR _upper_rate IS NULL THEN
    RAISE EXCEPTION 'Sub-agency commission tier rate is missing';
  END IF;

  _bonus_rate := _upper_rate - _sub_rate;
  IF _bonus_rate <= 0 THEN
    RETURN;
  END IF;

  _bonus_beans := FLOOR(_host_earnings * _bonus_rate / 100.0)::bigint;
  IF _bonus_beans <= 0 THEN
    RETURN;
  END IF;

  INSERT INTO public.agency_commission_history (
    agency_id, host_id, source_transaction_id, transaction_type,
    commission_amount, commission_rate, notes, created_at
  ) VALUES (
    _parent_agency_id, _host_id, _source_id, 'upper_agency_referral_bonus',
    _bonus_beans, _bonus_rate,
    format('Upper L%s bonus from sub L%s host (%s%% - %s%% = %s%%)',
           _upper_level, _sub_level, _upper_rate, _sub_rate, _bonus_rate),
    now()
  )
  ON CONFLICT (source_transaction_id, transaction_type) DO NOTHING;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  PERFORM set_config('app.bypass_profile_protection', 'true', true);
  UPDATE public.agencies
  SET beans_balance = COALESCE(beans_balance, 0) + _bonus_beans,
      updated_at = now()
  WHERE id = _parent_agency_id;
END;
$$;

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
  _host_percent numeric;
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

  SELECT (is_host = true AND host_status = 'approved') INTO _receiver_is_host
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

  IF _receiver_is_host THEN
    IF _gift.receiver_beans IS NOT NULL AND _gift.receiver_beans > 0 THEN
      _beans_amount := _gift.receiver_beans * _qty;
      _host_percent := NULL;
    ELSE
      _host_percent := public.get_effective_host_percent();
      IF _host_percent IS NULL OR _host_percent < 0 OR _host_percent > 100 THEN
        RETURN json_build_object(
          'success', false,
          'error', 'Gift host commission is not configured. Admin must set gift_commission.host_percent.'
        );
      END IF;
      _beans_amount := FLOOR(_total_cost::numeric * _host_percent / 100)::integer;
    END IF;
  END IF;

  PERFORM set_config('app.bypass_profile_protection', 'true', true);

  _new_sender_balance := _sender_balance - _total_cost;
  UPDATE public.profiles
  SET coins = _new_sender_balance,
      total_consumption = COALESCE(total_consumption, 0) + _total_cost
  WHERE id = p_sender_id;

  IF _receiver_is_host AND _beans_amount > 0 THEN
    UPDATE public.profiles
    SET beans = COALESCE(beans, 0) + _beans_amount,
        total_earnings = COALESCE(total_earnings, 0) + _beans_amount,
        weekly_earnings = COALESCE(weekly_earnings, 0) + _beans_amount,
        pending_earnings = COALESCE(pending_earnings, 0) + _beans_amount
    WHERE id = p_receiver_id;
  END IF;

  INSERT INTO public.gift_transactions (
    gift_id, sender_id, receiver_id, stream_id, room_id,
    coin_amount, coin_cost, quantity, receiver_beans
  ) VALUES (
    p_gift_id, p_sender_id, p_receiver_id, p_stream_id, p_party_room_id,
    _total_cost, _total_cost, _qty, _beans_amount
  ) RETURNING id INTO _transaction_id;

  RETURN json_build_object(
    'success', true,
    'transaction_id', _transaction_id,
    'coins_spent', _total_cost,
    'beans_earned', _beans_amount,
    'host_percent', _host_percent,
    'receiver_is_host', _receiver_is_host,
    'gift_name', _gift.name,
    'gift_icon_url', _gift.icon_url,
    'gift_animation_url', _gift.animation_url
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.settle_private_call(p_call_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _call RECORD;
  _settings_text text;
  _settings jsonb;
  _host_percent numeric;
  _grace_seconds integer;
  _duration integer;
  _minutes integer;
  _expected_charge integer;
  _already_charged integer;
  _delta_charge integer;
  _expected_host_beans integer;
  _already_credited integer;
  _delta_host_beans integer;
  _caller_balance integer;
BEGIN
  SELECT * INTO _call FROM public.private_calls WHERE id = p_call_id FOR UPDATE;

  IF _call IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'call_not_found');
  END IF;

  IF _call.settled_at IS NOT NULL THEN
    RETURN jsonb_build_object('success', true, 'already_settled', true);
  END IF;

  SELECT setting_value INTO _settings_text
  FROM public.app_settings
  WHERE setting_key = 'call_rates';

  IF _settings_text IS NULL OR btrim(_settings_text) = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Call pricing is not configured. Admin must set app_settings.call_rates.');
  END IF;

  BEGIN
    _settings := _settings_text::jsonb;
    _host_percent := (_settings->>'host_commission_percent')::numeric;
    _grace_seconds := COALESCE(
      (_settings->>'first_minute_grace_seconds')::integer,
      (_settings->>'grace_period_seconds')::integer
    );
  EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', 'Call pricing JSON is invalid. Admin must fix app_settings.call_rates.');
  END;

  IF _host_percent IS NULL OR _host_percent < 0 OR _host_percent > 100 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Call host commission percent is not configured.');
  END IF;

  IF _grace_seconds IS NULL OR _grace_seconds < 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Call grace seconds is not configured.');
  END IF;

  _duration := GREATEST(0, COALESCE(_call.duration_seconds, 0));

  PERFORM set_config('app.bypass_profile_protection', 'true', true);

  IF _duration < _grace_seconds THEN
    _expected_charge := COALESCE(_call.coins_per_minute, 0);
    _expected_host_beans := 0;
  ELSE
    _minutes := CEIL(_duration::numeric / 60.0)::integer;
    _expected_charge := _minutes * COALESCE(_call.coins_per_minute, 0);
    _expected_host_beans := FLOOR(_expected_charge::numeric * _host_percent / 100.0)::integer;
  END IF;

  _already_charged := COALESCE(_call.total_coins_deducted, _call.coins_spent, 0);
  _already_credited := COALESCE(_call.host_earned, _call.host_earnings_amount, 0);

  _delta_charge := _expected_charge - _already_charged;
  _delta_host_beans := _expected_host_beans - _already_credited;

  IF _delta_charge > 0 THEN
    SELECT coins INTO _caller_balance FROM public.profiles WHERE id = _call.caller_id FOR UPDATE;
    _delta_charge := LEAST(_delta_charge, COALESCE(_caller_balance, 0));
    IF _delta_charge > 0 THEN
      UPDATE public.profiles
      SET coins = coins - _delta_charge,
          total_consumption = COALESCE(total_consumption, 0) + _delta_charge,
          updated_at = now()
      WHERE id = _call.caller_id;
    END IF;
  ELSIF _delta_charge < 0 THEN
    UPDATE public.profiles
    SET coins = coins + ABS(_delta_charge),
        total_consumption = GREATEST(0, COALESCE(total_consumption, 0) - ABS(_delta_charge)),
        updated_at = now()
    WHERE id = _call.caller_id;
  END IF;

  IF _delta_host_beans > 0 THEN
    UPDATE public.profiles
    SET beans = COALESCE(beans, 0) + _delta_host_beans,
        total_earnings = COALESCE(total_earnings, 0) + _delta_host_beans,
        weekly_earnings = COALESCE(weekly_earnings, 0) + _delta_host_beans,
        pending_earnings = COALESCE(pending_earnings, 0) + _delta_host_beans,
        updated_at = now()
    WHERE id = _call.host_id;
  ELSIF _delta_host_beans < 0 THEN
    UPDATE public.profiles
    SET beans = GREATEST(0, COALESCE(beans, 0) - ABS(_delta_host_beans)),
        total_earnings = GREATEST(0, COALESCE(total_earnings, 0) - ABS(_delta_host_beans)),
        weekly_earnings = GREATEST(0, COALESCE(weekly_earnings, 0) - ABS(_delta_host_beans)),
        pending_earnings = GREATEST(0, COALESCE(pending_earnings, 0) - ABS(_delta_host_beans)),
        updated_at = now()
    WHERE id = _call.host_id;
  END IF;

  UPDATE public.private_calls
  SET coins_spent = _expected_charge,
      total_coins_deducted = _expected_charge,
      host_earned = _expected_host_beans,
      host_earnings_amount = _expected_host_beans,
      settled_at = now()
  WHERE id = p_call_id;

  RETURN jsonb_build_object(
    'success', true,
    'duration_seconds', _duration,
    'grace_seconds', _grace_seconds,
    'minutes_charged', CASE WHEN _duration < _grace_seconds THEN 1 ELSE CEIL(_duration::numeric / 60.0)::integer END,
    'coins_charged_total', _expected_charge,
    'host_beans_total', _expected_host_beans,
    'host_percent', _host_percent
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.request_agency_withdrawal(
  p_agency_id uuid,
  p_amount numeric,
  p_payment_method text DEFAULT 'epay'::text,
  p_payment_details jsonb DEFAULT '{}'::jsonb,
  p_notes text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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

  IF auth.uid() IS NOT NULL AND auth.uid() <> v_owner_id THEN
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
    v_beans_per_usd := NULL;
    v_min_beans_b := NULL;
    v_min_usd := NULL;
  END;

  SELECT setting_value INTO v_withdrawal_text FROM public.app_settings WHERE setting_key = 'withdrawal_settings';
  BEGIN
    v_withdrawal_json := v_withdrawal_text::jsonb;
    v_min_beans_a := (v_withdrawal_json->>'min_withdrawal')::numeric;
    v_withdrawal_beans_per_usd := (v_withdrawal_json->>'coins_to_dollar_rate')::numeric;
    v_free_limit := (v_withdrawal_json->>'free_withdrawal_limit')::numeric;
  EXCEPTION WHEN OTHERS THEN
    v_min_beans_a := NULL;
    v_withdrawal_beans_per_usd := NULL;
    v_free_limit := NULL;
  END;

  IF v_beans_per_usd IS NULL OR v_beans_per_usd <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Beans-to-USD rate not configured. Admin must set agency_commission.coins_to_dollar_rate.');
  END IF;

  IF v_withdrawal_beans_per_usd IS NULL OR v_withdrawal_beans_per_usd <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Withdrawal beans-to-USD rate not configured. Admin must set withdrawal_settings.coins_to_dollar_rate.');
  END IF;

  IF v_withdrawal_beans_per_usd <> v_beans_per_usd THEN
    RETURN jsonb_build_object('success', false, 'error', 'Beans-to-USD rates are mismatched. Admin must keep withdrawal_settings and agency_commission rates equal.');
  END IF;

  IF v_min_beans_a IS NULL OR v_min_beans_b IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Minimum withdrawal beans not configured. Admin must set both withdrawal_settings.min_withdrawal and agency_commission.min_payout.');
  END IF;

  v_min_beans_required := GREATEST(v_min_beans_a, v_min_beans_b);

  IF v_min_usd IS NULL OR v_min_usd <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Minimum withdrawal USD not configured. Admin must set agency_commission.min_usd.');
  END IF;

  IF v_free_limit IS NULL OR v_free_limit < 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Free withdrawal limit not configured. Admin must set withdrawal_settings.free_withdrawal_limit.');
  END IF;

  IF p_amount < v_min_beans_required THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', format('Minimum withdrawal is %s beans', v_min_beans_required::bigint),
      'min_beans', v_min_beans_required,
      'requested_beans', p_amount
    );
  END IF;

  SELECT setting_value INTO v_fee_text FROM public.app_settings WHERE setting_key = 'agency_withdrawal_fee';
  BEGIN
    v_fee_json := v_fee_text::jsonb;
    v_fee_percent := COALESCE((v_fee_json->>'rate')::numeric, (v_fee_json->>'percent')::numeric);
  EXCEPTION WHEN OTHERS THEN
    BEGIN
      v_fee_percent := v_fee_text::numeric;
    EXCEPTION WHEN OTHERS THEN
      v_fee_percent := NULL;
    END;
  END;

  IF v_fee_percent IS NULL OR v_fee_percent < 0 OR v_fee_percent > 100 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Agency withdrawal fee percent not configured. Admin must set agency_withdrawal_fee.');
  END IF;

  SELECT setting_value INTO v_helper_text FROM public.app_settings WHERE setting_key = 'helper_diamond_commission';
  BEGIN
    v_helper_json := v_helper_text::jsonb;
    v_helper_commission_percent := COALESCE((v_helper_json->>'rate')::numeric, (v_helper_json->>'percent')::numeric);
  EXCEPTION WHEN OTHERS THEN
    BEGIN
      v_helper_commission_percent := v_helper_text::numeric;
    EXCEPTION WHEN OTHERS THEN
      v_helper_commission_percent := NULL;
    END;
  END;

  IF v_helper_commission_percent IS NULL OR v_helper_commission_percent < 0 OR v_helper_commission_percent > 100 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Helper diamond commission percent not configured. Admin must set helper_diamond_commission.');
  END IF;

  v_effective_fee_percent := CASE WHEN p_amount <= v_free_limit THEN 0 ELSE v_fee_percent END;
  v_fee_beans := FLOOR(p_amount * v_effective_fee_percent / 100.0);
  v_net_beans := p_amount - v_fee_beans;
  v_net_diamonds_to_helper := FLOOR(p_amount * (1 - v_helper_commission_percent / 100.0));
  v_net_usd := ROUND(v_net_beans / v_beans_per_usd, 2);

  IF v_net_usd < v_min_usd THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', format('Net withdrawal must be at least $%s USD (currently $%s after fee)', v_min_usd, v_net_usd),
      'min_usd', v_min_usd,
      'net_usd', v_net_usd
    );
  END IF;

  PERFORM set_config('app.bypass_profile_protection', 'true', true);

  UPDATE public.agencies
  SET wallet_balance = wallet_balance - p_amount,
      updated_at = now()
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