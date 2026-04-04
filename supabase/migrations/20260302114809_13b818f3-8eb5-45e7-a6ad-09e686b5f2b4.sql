
-- Drop existing function with defaults to recreate
DROP FUNCTION IF EXISTS public.process_gift_transaction(uuid, uuid, uuid, integer, uuid, uuid, uuid);

-- =====================================================
-- CRITICAL FINANCIAL FIX: Commission Rate Standardization
-- =====================================================

-- 1. FIX get_effective_host_percent() - gift_commission is PRIMARY source
CREATE OR REPLACE FUNCTION public.get_effective_host_percent()
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_setting jsonb;
  v_host numeric;
BEGIN
  SELECT setting_value INTO v_setting FROM app_settings WHERE setting_key = 'gift_commission' ORDER BY updated_at DESC NULLS LAST LIMIT 1;
  IF v_setting IS NOT NULL AND jsonb_typeof(v_setting) = 'object' THEN
    v_host := NULLIF(v_setting->>'host_percent', '')::numeric;
    IF v_host IS NULL AND (v_setting ? 'company_percent') THEN
      v_host := 100 - NULLIF(v_setting->>'company_percent', '')::numeric;
    END IF;
  END IF;
  IF v_host IS NULL THEN
    SELECT setting_value INTO v_setting FROM app_settings WHERE setting_key = 'host_percent' ORDER BY updated_at DESC NULLS LAST LIMIT 1;
    IF v_setting IS NOT NULL THEN
      IF jsonb_typeof(v_setting) = 'number' THEN v_host := (v_setting::text)::numeric;
      ELSIF jsonb_typeof(v_setting) = 'object' THEN v_host := NULLIF(COALESCE(v_setting->>'host_percent', v_setting->>'hostPercent'), '')::numeric;
      END IF;
    END IF;
  END IF;
  RETURN LEAST(100, GREATEST(0, COALESCE(v_host, 50)))::integer;
EXCEPTION WHEN OTHERS THEN RETURN 50;
END;
$$;

-- 2. FIX get_call_host_commission_percent()
CREATE OR REPLACE FUNCTION public.get_call_host_commission_percent()
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_setting jsonb;
  v_host numeric;
BEGIN
  SELECT setting_value INTO v_setting FROM app_settings WHERE setting_key = 'call_rates' ORDER BY updated_at DESC NULLS LAST LIMIT 1;
  IF v_setting IS NOT NULL AND jsonb_typeof(v_setting) = 'object' THEN
    v_host := NULLIF(v_setting->>'host_commission_percent', '')::numeric;
    IF v_host IS NULL AND (v_setting ? 'company_percent') THEN
      v_host := 100 - NULLIF(v_setting->>'company_percent', '')::numeric;
    END IF;
  END IF;
  IF v_host IS NULL THEN
    SELECT setting_value INTO v_setting FROM app_settings WHERE setting_key = 'call_pricing' ORDER BY updated_at DESC NULLS LAST LIMIT 1;
    IF v_setting IS NOT NULL AND jsonb_typeof(v_setting) = 'object' THEN
      v_host := NULLIF(v_setting->>'host_commission_percent', '')::numeric;
      IF v_host IS NULL AND (v_setting ? 'company_commission_percent') THEN
        v_host := 100 - NULLIF(v_setting->>'company_commission_percent', '')::numeric;
      END IF;
    END IF;
  END IF;
  IF v_host IS NULL THEN RETURN public.get_effective_host_percent(); END IF;
  RETURN LEAST(100, GREATEST(0, v_host))::integer;
EXCEPTION WHEN OTHERS THEN RETURN public.get_effective_host_percent();
END;
$$;

-- 3. FIX add_to_weekly_earnings - use admin setting, not hardcoded 60%
CREATE OR REPLACE FUNCTION public.add_to_weekly_earnings()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _receiver_is_host boolean;
  _beans_amount numeric;
  _host_percent numeric;
BEGIN
  SELECT is_host INTO _receiver_is_host FROM profiles WHERE id = NEW.receiver_id;
  IF _receiver_is_host = true THEN
    _host_percent := public.get_effective_host_percent();
    _beans_amount := FLOOR(NEW.coin_amount * _host_percent / 100);
    UPDATE profiles SET weekly_earnings = COALESCE(weekly_earnings, 0) + _beans_amount WHERE id = NEW.receiver_id;
  END IF;
  RETURN NEW;
END;
$$;

-- 4. FIX deduct_call_coins_per_minute - use get_call_host_commission_percent() 
CREATE OR REPLACE FUNCTION public.deduct_call_coins_per_minute(p_call_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _call_record record;
  _caller_balance integer;
  _coins_to_deduct integer;
  _host_beans integer;
  _host_commission_percent integer;
  _time_since_last_billing integer;
  _call_duration_seconds integer;
  _grace_period_seconds integer;
  _is_first_minute boolean;
  _is_second_minute boolean;
  _first_minute_host_beans integer;
  _settings jsonb;
BEGIN
  SELECT * INTO _call_record FROM private_calls WHERE id = p_call_id FOR UPDATE;
  IF _call_record IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'call_not_found'); END IF;
  IF auth.uid() IS NOT NULL AND auth.uid() != _call_record.caller_id AND auth.uid() != _call_record.host_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;
  IF _call_record.status != 'connected' THEN RETURN jsonb_build_object('success', false, 'error', 'call_not_connected'); END IF;

  _call_duration_seconds := COALESCE(_call_record.duration_seconds, 0);
  _is_first_minute := _call_duration_seconds = 0;
  _is_second_minute := _call_duration_seconds = 60;

  IF _call_record.last_billing_at IS NOT NULL THEN
    _time_since_last_billing := EXTRACT(EPOCH FROM (now() - _call_record.last_billing_at))::integer;
    IF _time_since_last_billing < 50 THEN RETURN jsonb_build_object('success', true, 'skipped', true, 'reason', 'recently_billed'); END IF;
  END IF;

  -- CANONICAL: Use function instead of raw JSON
  _host_commission_percent := public.get_call_host_commission_percent();

  SELECT setting_value INTO _settings FROM app_settings WHERE setting_key = 'call_rates';
  _grace_period_seconds := COALESCE((_settings->>'first_minute_grace_seconds')::integer, 21);

  _coins_to_deduct := _call_record.coins_per_minute;
  _first_minute_host_beans := FLOOR(_coins_to_deduct * _host_commission_percent / 100);

  IF _is_first_minute THEN _host_beans := 0;
  ELSIF _is_second_minute THEN _host_beans := _first_minute_host_beans * 2;
  ELSE _host_beans := _first_minute_host_beans;
  END IF;

  SELECT coins INTO _caller_balance FROM profiles WHERE id = _call_record.caller_id;

  IF _caller_balance < _coins_to_deduct THEN
    IF _is_second_minute OR (_call_duration_seconds > 0 AND _call_record.host_earned = 0) THEN
      UPDATE profiles SET beans = COALESCE(beans, 0) + _first_minute_host_beans, weekly_earnings = COALESCE(weekly_earnings, 0) + _first_minute_host_beans, total_earnings = COALESCE(total_earnings, 0) + _first_minute_host_beans, updated_at = now() WHERE id = _call_record.host_id;
      UPDATE private_calls SET host_earned = COALESCE(host_earned, 0) + _first_minute_host_beans WHERE id = p_call_id;
    END IF;
    UPDATE private_calls SET status = 'ended', ended_at = now(), end_reason = 'insufficient_coins' WHERE id = p_call_id;
    RETURN jsonb_build_object('success', false, 'error', 'insufficient_balance', 'caller_balance', _caller_balance, 'required', _coins_to_deduct, 'call_ended', true);
  END IF;

  UPDATE profiles SET coins = coins - _coins_to_deduct, updated_at = now() WHERE id = _call_record.caller_id;
  IF _host_beans > 0 THEN
    UPDATE profiles SET beans = COALESCE(beans, 0) + _host_beans, weekly_earnings = COALESCE(weekly_earnings, 0) + _host_beans, total_earnings = COALESCE(total_earnings, 0) + _host_beans, updated_at = now() WHERE id = _call_record.host_id;
  END IF;

  UPDATE private_calls SET coins_spent = COALESCE(coins_spent, 0) + _coins_to_deduct, total_coins_deducted = COALESCE(total_coins_deducted, 0) + _coins_to_deduct, host_earned = COALESCE(host_earned, 0) + _host_beans, duration_seconds = COALESCE(duration_seconds, 0) + 60, last_billing_at = now() WHERE id = p_call_id;

  RETURN jsonb_build_object('success', true, 'coins_deducted', _coins_to_deduct, 'host_earned', _host_beans, 'commission_percent', _host_commission_percent, 'caller_remaining', _caller_balance - _coins_to_deduct, 'call_duration', _call_duration_seconds + 60, 'is_first_minute', _is_first_minute, 'is_second_minute', _is_second_minute, 'grace_period_seconds', _grace_period_seconds);
END;
$$;

-- 5. FIX process_gift_transaction - hosts get beans, non-hosts get coins via trigger
CREATE OR REPLACE FUNCTION public.process_gift_transaction(
  p_sender_id uuid, p_receiver_id uuid, p_gift_id uuid, p_quantity integer,
  p_stream_id uuid DEFAULT NULL, p_party_room_id uuid DEFAULT NULL, p_call_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_gift RECORD;
  v_sender RECORD;
  v_total_coins BIGINT;
  v_host_percent INT;
  v_beans_earned BIGINT;
  v_transaction_id UUID;
  v_receiver_is_host BOOLEAN;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() != p_sender_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: You can only send gifts from your own account');
  END IF;
  IF COALESCE(p_quantity, 0) <= 0 THEN RETURN jsonb_build_object('success', false, 'error', 'Invalid quantity'); END IF;

  SELECT id, name, coin_value, icon_url, animation_url INTO v_gift FROM gifts WHERE id = p_gift_id AND is_active = true;
  IF v_gift IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Gift not found or inactive'); END IF;

  v_total_coins := v_gift.coin_value::BIGINT * p_quantity::BIGINT;
  SELECT id, coins INTO v_sender FROM profiles WHERE id = p_sender_id FOR UPDATE;
  IF v_sender IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Sender not found'); END IF;
  IF v_sender.coins < v_total_coins THEN RETURN jsonb_build_object('success', false, 'error', 'Insufficient coins', 'required', v_total_coins, 'available', v_sender.coins); END IF;

  SELECT COALESCE(is_host, false) INTO v_receiver_is_host FROM profiles WHERE id = p_receiver_id;
  v_host_percent := public.get_effective_host_percent();
  v_beans_earned := FLOOR((v_total_coins::NUMERIC * v_host_percent) / 100)::BIGINT;

  -- Deduct from sender
  UPDATE profiles SET coins = coins - v_total_coins, total_consumption = COALESCE(total_consumption, 0) + v_total_coins, updated_at = now() WHERE id = p_sender_id;

  -- HOSTS get beans; NON-HOSTS get coins via update_host_earnings_on_gift trigger
  IF v_receiver_is_host THEN
    UPDATE profiles SET beans = COALESCE(beans, 0) + v_beans_earned, pending_earnings = COALESCE(pending_earnings, 0) + v_beans_earned, total_earnings = COALESCE(total_earnings, 0) + v_beans_earned, updated_at = now() WHERE id = p_receiver_id;
  END IF;

  INSERT INTO gift_transactions (gift_id, sender_id, receiver_id, coin_amount, quantity, stream_id, party_room_id, call_id, created_at)
  VALUES (p_gift_id, p_sender_id, p_receiver_id, v_total_coins, p_quantity, p_stream_id, p_party_room_id, p_call_id, now())
  RETURNING id INTO v_transaction_id;

  IF p_stream_id IS NOT NULL THEN
    UPDATE live_streams SET total_gifts = COALESCE(total_gifts, 0) + 1, total_coins_earned = COALESCE(total_coins_earned, 0) + v_total_coins WHERE id = p_stream_id;
  END IF;

  RETURN jsonb_build_object('success', true, 'transaction_id', v_transaction_id, 'coins_spent', v_total_coins, 'beans_earned', v_beans_earned, 'host_percent', v_host_percent, 'is_host', v_receiver_is_host, 'gift_name', v_gift.name, 'gift_icon_url', v_gift.icon_url, 'gift_animation_url', v_gift.animation_url);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- 6. FIX update_host_earnings_on_gift - consistent agency tracking + non-host coins
CREATE OR REPLACE FUNCTION public.update_host_earnings_on_gift()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _host_is_host BOOLEAN;
  _host_agency_id UUID;
  _period_start DATE;
  _host_earnings NUMERIC;
BEGIN
  SELECT is_host, agency_id INTO _host_is_host, _host_agency_id FROM public.profiles WHERE id = NEW.receiver_id;

  IF _host_is_host = true AND _host_agency_id IS NOT NULL THEN
    _host_earnings := FLOOR(NEW.coin_amount * public.get_effective_host_percent() / 100);
    _period_start := date_trunc('week', CURRENT_DATE)::date;
    INSERT INTO public.agency_performance (agency_id, period_type, period_start, total_income, golden_host_income)
    VALUES (_host_agency_id, 'weekly', _period_start, _host_earnings, _host_earnings)
    ON CONFLICT (agency_id, period_type, period_start) DO UPDATE SET
      total_income = agency_performance.total_income + _host_earnings,
      golden_host_income = agency_performance.golden_host_income + _host_earnings,
      updated_at = now();
  END IF;

  -- Non-hosts get full coins back (gift acts as coin transfer)
  IF _host_is_host IS NOT TRUE THEN
    UPDATE public.profiles SET coins = COALESCE(coins, 0) + NEW.coin_amount WHERE id = NEW.receiver_id;
  END IF;

  RETURN NEW;
END;
$$;

-- 7. FIX auto_credit_agency_commission - consistent with canonical function
CREATE OR REPLACE FUNCTION public.auto_credit_agency_commission()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _host_agency_id UUID;
  _agency_level TEXT;
  _agency_commission_rate NUMERIC;
  _commission_amount NUMERIC;
  _host_earnings NUMERIC;
  _host_percent NUMERIC;
BEGIN
  SELECT ah.agency_id INTO _host_agency_id FROM agency_hosts ah WHERE ah.host_id = NEW.receiver_id AND ah.status = 'active' LIMIT 1;
  IF _host_agency_id IS NULL THEN RETURN NEW; END IF;

  _host_percent := public.get_effective_host_percent();
  _host_earnings := FLOOR(NEW.coin_amount * _host_percent / 100);

  SELECT a.level INTO _agency_level FROM agencies a WHERE a.id = _host_agency_id;
  SELECT COALESCE(alt.commission_rate, 3) INTO _agency_commission_rate FROM agency_level_tiers alt WHERE alt.level_code = COALESCE(_agency_level, 'A1') AND alt.is_active = true;
  _commission_amount := FLOOR(_host_earnings * COALESCE(_agency_commission_rate, 3) / 100);

  IF _commission_amount > 0 THEN
    UPDATE agencies SET beans_balance = COALESCE(beans_balance, 0) + _commission_amount WHERE id = _host_agency_id;
    INSERT INTO agency_commission_history (agency_id, host_id, transaction_type, original_amount, commission_rate, commission_amount, source_transaction_id, notes)
    VALUES (_host_agency_id, NEW.receiver_id, 'gift', _host_earnings, COALESCE(_agency_commission_rate, 3), _commission_amount, NEW.id,
      'Gift: ' || NEW.coin_amount || ' coins → Host ' || _host_percent || '% = ' || _host_earnings || ' → Agency ' || COALESCE(_agency_commission_rate, 3) || '% = ' || _commission_amount);
  END IF;
  RETURN NEW;
END;
$$;
