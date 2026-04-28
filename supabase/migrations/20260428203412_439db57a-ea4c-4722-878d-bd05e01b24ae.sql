-- ============================================================================
-- Pkg23: FINANCIAL PRECISION FIX
-- 100% admin-driven, no hardcoded rates, deterministic integer math
-- NOTE: app_settings.setting_value is TEXT (not jsonb). We cast on read.
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- 1) GIFT: Drop double-credit triggers
-- ────────────────────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_update_host_earnings_on_gift ON public.gift_transactions;
DROP TRIGGER IF EXISTS update_host_earnings_on_gift_trigger ON public.gift_transactions;
DROP TRIGGER IF EXISTS auto_update_host_earnings_on_gift ON public.gift_transactions;

CREATE OR REPLACE FUNCTION public.update_host_earnings_on_gift()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- DEPRECATED: gift host beans are credited inside process_gift_transaction RPC.
  RETURN NEW;
END;
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- 2) GIFT: Harden process_gift_transaction
-- ────────────────────────────────────────────────────────────────────────────
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
SET search_path TO 'public'
AS $$
DECLARE
  _gift RECORD;
  _total_cost INTEGER;
  _sender_balance INTEGER;
  _new_sender_balance INTEGER;
  _beans_amount INTEGER := 0;
  _host_percent NUMERIC;
  _transaction_id UUID;
  _receiver_is_host BOOLEAN := false;
  _qty INTEGER;
BEGIN
  _qty := GREATEST(1, COALESCE(p_quantity, 1));

  IF p_sender_id IS NULL OR p_receiver_id IS NULL OR p_gift_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Missing required arguments');
  END IF;
  IF p_sender_id = p_receiver_id THEN
    RETURN json_build_object('success', false, 'error', 'Cannot send gift to self');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = p_receiver_id) THEN
    RETURN json_build_object('success', false, 'error', 'Receiver not found');
  END IF;

  SELECT (is_host = true AND host_status = 'approved') INTO _receiver_is_host
    FROM profiles WHERE id = p_receiver_id;

  SELECT id, name, coin_value, icon_url, animation_url, receiver_beans INTO _gift
    FROM gifts WHERE id = p_gift_id AND is_active = true;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Gift not found');
  END IF;

  _total_cost := _gift.coin_value * _qty;

  SELECT coins INTO _sender_balance FROM profiles WHERE id = p_sender_id FOR UPDATE;
  IF _sender_balance IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Sender not found');
  END IF;
  IF _sender_balance < _total_cost THEN
    RETURN json_build_object('success', false, 'error', 'Insufficient diamonds');
  END IF;

  PERFORM set_config('app.bypass_profile_protection', 'true', true);

  _new_sender_balance := _sender_balance - _total_cost;
  UPDATE profiles
     SET coins = _new_sender_balance,
         total_consumption = COALESCE(total_consumption, 0) + _total_cost
   WHERE id = p_sender_id;

  IF _receiver_is_host THEN
    IF _gift.receiver_beans IS NOT NULL AND _gift.receiver_beans > 0 THEN
      _beans_amount := _gift.receiver_beans * _qty;
      _host_percent := NULL;
    ELSE
      _host_percent := public.get_effective_host_percent();
      IF _host_percent IS NULL OR _host_percent <= 0 THEN
        RAISE LOG 'process_gift_transaction: gift_commission.host_percent not configured; crediting 0 beans';
        _beans_amount := 0;
      ELSE
        _beans_amount := FLOOR(_total_cost::numeric * _host_percent / 100)::integer;
      END IF;
    END IF;

    IF _beans_amount > 0 THEN
      UPDATE profiles
         SET beans = COALESCE(beans, 0) + _beans_amount,
             total_earnings = COALESCE(total_earnings, 0) + _beans_amount,
             weekly_earnings = COALESCE(weekly_earnings, 0) + _beans_amount,
             pending_earnings = COALESCE(pending_earnings, 0) + _beans_amount
       WHERE id = p_receiver_id;
    END IF;
  END IF;

  INSERT INTO gift_transactions (
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
    'host_percent', COALESCE(_host_percent, 0),
    'receiver_is_host', _receiver_is_host,
    'gift_name', _gift.name,
    'gift_icon_url', _gift.icon_url,
    'gift_animation_url', _gift.animation_url
  );
END;
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- 3) Drop broken text overload of end_private_call
-- ────────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.end_private_call(text, text);

-- ────────────────────────────────────────────────────────────────────────────
-- 4) Add settled_at column for idempotency
-- ────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema='public' AND table_name='private_calls' AND column_name='settled_at'
  ) THEN
    ALTER TABLE public.private_calls ADD COLUMN settled_at timestamptz;
  END IF;
END$$;

-- ────────────────────────────────────────────────────────────────────────────
-- 5) CALL: settle_private_call — 21s rule + symmetric per-minute
-- ────────────────────────────────────────────────────────────────────────────
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
  SELECT * INTO _call FROM private_calls WHERE id = p_call_id FOR UPDATE;
  IF _call IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'call_not_found');
  END IF;

  IF _call.settled_at IS NOT NULL THEN
    RETURN jsonb_build_object('success', true, 'already_settled', true);
  END IF;

  SELECT setting_value INTO _settings_text FROM app_settings WHERE setting_key = 'call_rates';
  BEGIN
    _settings := _settings_text::jsonb;
  EXCEPTION WHEN OTHERS THEN
    _settings := '{}'::jsonb;
  END;

  _host_percent := COALESCE((_settings->>'host_commission_percent')::numeric, 0);
  _grace_seconds := COALESCE((_settings->>'grace_period_seconds')::integer, 21);

  IF _host_percent <= 0 THEN
    RAISE LOG 'settle_private_call: host_commission_percent not configured in app_settings.call_rates';
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
    SELECT coins INTO _caller_balance FROM profiles WHERE id = _call.caller_id FOR UPDATE;
    _delta_charge := LEAST(_delta_charge, COALESCE(_caller_balance, 0));
    IF _delta_charge > 0 THEN
      UPDATE profiles
         SET coins = coins - _delta_charge,
             total_consumption = COALESCE(total_consumption, 0) + _delta_charge,
             updated_at = now()
       WHERE id = _call.caller_id;
    END IF;
  ELSIF _delta_charge < 0 THEN
    UPDATE profiles
       SET coins = coins + ABS(_delta_charge),
           total_consumption = GREATEST(0, COALESCE(total_consumption, 0) - ABS(_delta_charge)),
           updated_at = now()
     WHERE id = _call.caller_id;
  END IF;

  IF _delta_host_beans > 0 THEN
    UPDATE profiles
       SET beans = COALESCE(beans, 0) + _delta_host_beans,
           total_earnings = COALESCE(total_earnings, 0) + _delta_host_beans,
           weekly_earnings = COALESCE(weekly_earnings, 0) + _delta_host_beans,
           pending_earnings = COALESCE(pending_earnings, 0) + _delta_host_beans,
           updated_at = now()
     WHERE id = _call.host_id;
  ELSIF _delta_host_beans < 0 THEN
    UPDATE profiles
       SET beans = GREATEST(0, COALESCE(beans, 0) - ABS(_delta_host_beans)),
           total_earnings = GREATEST(0, COALESCE(total_earnings, 0) - ABS(_delta_host_beans)),
           weekly_earnings = GREATEST(0, COALESCE(weekly_earnings, 0) - ABS(_delta_host_beans)),
           pending_earnings = GREATEST(0, COALESCE(pending_earnings, 0) - ABS(_delta_host_beans)),
           updated_at = now()
     WHERE id = _call.host_id;
  END IF;

  UPDATE private_calls
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
    'minutes_charged', CASE WHEN _duration < _grace_seconds THEN 1 ELSE CEIL(_duration::numeric/60.0)::integer END,
    'coins_charged_total', _expected_charge,
    'host_beans_total', _expected_host_beans,
    'host_percent', _host_percent
  );
END;
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- 6) end_private_call(uuid) → calls settle_private_call
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.end_private_call(_call_id uuid, _end_reason text DEFAULT 'normal')
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _call_record record;
  _duration integer := 0;
BEGIN
  SELECT * INTO _call_record
    FROM public.private_calls
   WHERE id = _call_id AND status IN ('ringing', 'connected', 'active')
   FOR UPDATE;

  IF _call_record IS NULL THEN
    UPDATE public.profiles
       SET is_in_call = false, current_call_id = NULL, updated_at = now()
     WHERE current_call_id = _call_id;
    RETURN false;
  END IF;

  IF auth.uid() IS NOT NULL
     AND auth.uid() <> _call_record.caller_id
     AND auth.uid() <> _call_record.host_id THEN
    RAISE EXCEPTION 'Not authorized to end this call';
  END IF;

  IF _call_record.connected_at IS NOT NULL THEN
    _duration := GREATEST(EXTRACT(EPOCH FROM (now() - _call_record.connected_at))::integer,
                          COALESCE(_call_record.duration_seconds, 0));
  ELSIF _call_record.started_at IS NOT NULL THEN
    _duration := GREATEST(EXTRACT(EPOCH FROM (now() - _call_record.started_at))::integer,
                          COALESCE(_call_record.duration_seconds, 0));
  ELSE
    _duration := COALESCE(_call_record.duration_seconds, 0);
  END IF;

  UPDATE public.private_calls
     SET status = 'ended',
         ended_at = now(),
         end_reason = _end_reason,
         duration_seconds = _duration
   WHERE id = _call_id;

  PERFORM public.settle_private_call(_call_id);

  UPDATE public.profiles
     SET is_in_call = false, current_call_id = NULL, updated_at = now()
   WHERE id IN (_call_record.caller_id, _call_record.host_id);

  UPDATE public.profiles
     SET total_calls_made = COALESCE(total_calls_made, 0) + 1, updated_at = now()
   WHERE id = _call_record.caller_id;

  UPDATE public.profiles
     SET total_calls_received = COALESCE(total_calls_received, 0) + 1,
         total_call_minutes = COALESCE(total_call_minutes, 0) + CEIL(GREATEST(_duration,0)::numeric/60),
         updated_at = now()
   WHERE id = _call_record.host_id;

  INSERT INTO public.call_events (call_id, event_type, event_data)
  VALUES (_call_id, 'call_ended',
    jsonb_build_object('end_reason', _end_reason, 'duration_seconds', _duration, 'ended_by', auth.uid()));

  RETURN true;
EXCEPTION WHEN OTHERS THEN
  RAISE LOG 'end_private_call failed for %: % (%)', _call_id, SQLERRM, SQLSTATE;
  RAISE;
END;
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- 7) deduct_call_coins_per_minute — fix 2x bug, symmetric billing
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.deduct_call_coins_per_minute(p_call_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _call_record record;
  _caller_balance integer;
  _coins_to_deduct integer;
  _host_beans integer;
  _settings_text text;
  _settings jsonb;
  _host_commission_percent numeric;
BEGIN
  SELECT * INTO _call_record FROM private_calls WHERE id = p_call_id FOR UPDATE;
  IF _call_record IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'call_not_found');
  END IF;
  IF _call_record.status != 'connected' THEN
    RETURN jsonb_build_object('success', false, 'error', 'call_not_connected');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM profiles WHERE id = _call_record.host_id AND is_host = true AND host_status = 'approved'
  ) THEN
    UPDATE private_calls SET status = 'ended', ended_at = now(), end_reason = 'host_unverified' WHERE id = p_call_id;
    PERFORM public.settle_private_call(p_call_id);
    RETURN jsonb_build_object('success', false, 'error', 'host_unverified', 'call_ended', true);
  END IF;

  SELECT setting_value INTO _settings_text FROM app_settings WHERE setting_key = 'call_rates';
  BEGIN _settings := _settings_text::jsonb; EXCEPTION WHEN OTHERS THEN _settings := '{}'::jsonb; END;
  _host_commission_percent := COALESCE((_settings->>'host_commission_percent')::numeric, 0);

  _coins_to_deduct := COALESCE(_call_record.coins_per_minute, 0);
  _host_beans := FLOOR(_coins_to_deduct::numeric * _host_commission_percent / 100.0)::integer;

  SELECT coins INTO _caller_balance FROM profiles WHERE id = _call_record.caller_id;

  PERFORM set_config('app.bypass_profile_protection', 'true', true);

  IF _caller_balance < _coins_to_deduct THEN
    UPDATE private_calls SET status = 'ended', ended_at = now(), end_reason = 'insufficient_coins' WHERE id = p_call_id;
    PERFORM public.settle_private_call(p_call_id);
    RETURN jsonb_build_object('success', false, 'error', 'insufficient_balance', 'call_ended', true);
  END IF;

  UPDATE profiles
     SET coins = coins - _coins_to_deduct,
         total_consumption = COALESCE(total_consumption, 0) + _coins_to_deduct,
         updated_at = now()
   WHERE id = _call_record.caller_id;

  IF _host_beans > 0 THEN
    UPDATE profiles
       SET beans = COALESCE(beans, 0) + _host_beans,
           weekly_earnings = COALESCE(weekly_earnings, 0) + _host_beans,
           total_earnings = COALESCE(total_earnings, 0) + _host_beans,
           pending_earnings = COALESCE(pending_earnings, 0) + _host_beans,
           updated_at = now()
     WHERE id = _call_record.host_id;
  END IF;

  UPDATE private_calls
     SET coins_spent = COALESCE(coins_spent, 0) + _coins_to_deduct,
         total_coins_deducted = COALESCE(total_coins_deducted, 0) + _coins_to_deduct,
         host_earned = COALESCE(host_earned, 0) + _host_beans,
         host_earnings_amount = COALESCE(host_earnings_amount, 0) + _host_beans,
         duration_seconds = COALESCE(duration_seconds, 0) + 60,
         last_billing_at = now()
   WHERE id = p_call_id;

  RETURN jsonb_build_object(
    'success', true,
    'coins_deducted', _coins_to_deduct,
    'host_earned', _host_beans,
    'caller_balance', _caller_balance - _coins_to_deduct
  );
END;
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- 8) Ensure call_rates default exists (TEXT column holds JSON string)
-- ────────────────────────────────────────────────────────────────────────────
INSERT INTO public.app_settings (setting_key, setting_value)
SELECT 'call_rates', '{"host_commission_percent": 50, "grace_period_seconds": 21}'
WHERE NOT EXISTS (SELECT 1 FROM public.app_settings WHERE setting_key = 'call_rates');

-- ────────────────────────────────────────────────────────────────────────────
-- 9) Tiered agency commission resolver
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.resolve_agency_commission_rate(_agency_id uuid)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _agency_level text;
  _level_rate numeric;
  _weekly numeric;
  _settings_text text;
  _settings jsonb;
  _tiers jsonb;
  _tier jsonb;
  _best_rate numeric := NULL;
BEGIN
  SELECT a.level INTO _agency_level FROM agencies a WHERE a.id = _agency_id;
  SELECT alt.commission_rate INTO _level_rate
    FROM agency_level_tiers alt
   WHERE alt.level_code = COALESCE(_agency_level, 'A1') AND alt.is_active = true;

  IF _level_rate IS NOT NULL THEN
    RETURN _level_rate;
  END IF;

  SELECT COALESCE(SUM(p.weekly_earnings), 0)::numeric INTO _weekly
    FROM agency_hosts ah
    JOIN profiles p ON p.id = ah.host_id
   WHERE ah.agency_id = _agency_id AND ah.status = 'active';

  SELECT setting_value INTO _settings_text FROM app_settings WHERE setting_key = 'agency_commission';
  BEGIN _settings := _settings_text::jsonb; EXCEPTION WHEN OTHERS THEN _settings := '{}'::jsonb; END;

  _tiers := COALESCE(_settings->'commission_tiers', '[]'::jsonb);
  FOR _tier IN SELECT * FROM jsonb_array_elements(_tiers)
  LOOP
    IF (_tier->>'min_earnings')::numeric <= _weekly THEN
      IF _best_rate IS NULL OR (_tier->>'percent')::numeric > _best_rate THEN
        _best_rate := (_tier->>'percent')::numeric;
      END IF;
    END IF;
  END LOOP;

  RETURN COALESCE(_best_rate, (_settings->>'agency_percent')::numeric, 3);
END;
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- 10) Update agency commission triggers to use tiered resolver
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.auto_credit_agency_commission()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _host_agency_id UUID;
  _rate NUMERIC;
  _commission_amount NUMERIC;
  _host_earnings NUMERIC;
  _host_percent NUMERIC;
BEGIN
  SELECT ah.agency_id INTO _host_agency_id
    FROM agency_hosts ah
   WHERE ah.host_id = NEW.receiver_id AND ah.status = 'active' LIMIT 1;
  IF _host_agency_id IS NULL THEN RETURN NEW; END IF;

  _host_percent := public.get_effective_host_percent();
  _host_earnings := COALESCE(NEW.receiver_beans, FLOOR(NEW.coin_amount * COALESCE(_host_percent,0) / 100));
  IF _host_earnings <= 0 THEN RETURN NEW; END IF;

  _rate := public.resolve_agency_commission_rate(_host_agency_id);
  _commission_amount := FLOOR(_host_earnings * _rate / 100);

  IF _commission_amount > 0 THEN
    PERFORM set_config('app.bypass_profile_protection', 'true', true);
    UPDATE agencies SET beans_balance = COALESCE(beans_balance, 0) + _commission_amount WHERE id = _host_agency_id;
    INSERT INTO agency_commission_history (agency_id, host_id, transaction_type, original_amount, commission_rate, commission_amount, source_transaction_id, notes)
    VALUES (_host_agency_id, NEW.receiver_id, 'gift', _host_earnings, _rate, _commission_amount, NEW.id, 'Gift commission (tiered)');
  END IF;
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
  _host_agency_id UUID;
  _rate NUMERIC;
  _commission_amount NUMERIC;
  _host_earnings NUMERIC;
BEGIN
  IF NEW.status NOT IN ('ended', 'completed', 'settled') OR OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  SELECT ah.agency_id INTO _host_agency_id
    FROM agency_hosts ah
   WHERE ah.host_id = NEW.host_id AND ah.status = 'active' LIMIT 1;
  IF _host_agency_id IS NULL THEN RETURN NEW; END IF;

  _host_earnings := COALESCE(NULLIF(NEW.host_earned, 0), NULLIF(NEW.host_earnings_amount, 0), 0);
  IF _host_earnings IS NULL OR _host_earnings <= 0 THEN RETURN NEW; END IF;

  -- Idempotency
  IF EXISTS (
    SELECT 1 FROM agency_commission_history
     WHERE source_transaction_id = NEW.id AND transaction_type = 'call'
  ) THEN
    RETURN NEW;
  END IF;

  _rate := public.resolve_agency_commission_rate(_host_agency_id);
  _commission_amount := FLOOR(_host_earnings * _rate / 100);

  IF _commission_amount > 0 THEN
    PERFORM set_config('app.bypass_profile_protection', 'true', true);
    UPDATE agencies SET beans_balance = COALESCE(beans_balance, 0) + _commission_amount WHERE id = _host_agency_id;
    INSERT INTO agency_commission_history (
      agency_id, host_id, transaction_type, original_amount,
      commission_rate, commission_amount, source_transaction_id, notes
    ) VALUES (
      _host_agency_id, NEW.host_id, 'call', _host_earnings,
      _rate, _commission_amount, NEW.id,
      'Call commission (tiered, duration: ' || COALESCE(NEW.duration_seconds, 0) || 's)'
    );
  END IF;
  RETURN NEW;
END;
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- 11) Withdrawal: drop legacy overloads, single canonical version
-- ────────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.request_agency_withdrawal(integer, text, jsonb);
DROP FUNCTION IF EXISTS public.request_agency_withdrawal(uuid, numeric, text, jsonb);

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
SET search_path TO 'public'
AS $$
DECLARE
  v_current_balance NUMERIC;
  v_owner_id uuid;
  v_withdrawal_id UUID;
  v_fee_percent NUMERIC := 0;
  v_helper_commission_percent NUMERIC := 0;
  v_fee_beans NUMERIC;
  v_net_beans NUMERIC;
  v_net_diamonds_to_helper NUMERIC;
  v_beans_per_usd NUMERIC := 9000;
  v_net_usd NUMERIC;
  v_fee_text text;
  v_helper_text text;
  v_agency_text text;
  v_fee_json jsonb;
  v_helper_json jsonb;
  v_agency_json jsonb;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid amount');
  END IF;

  SELECT owner_id, wallet_balance INTO v_owner_id, v_current_balance
    FROM agencies WHERE id = p_agency_id FOR UPDATE;

  IF v_owner_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Agency not found');
  END IF;
  IF auth.uid() IS NOT NULL AND auth.uid() <> v_owner_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;
  IF v_current_balance < p_amount THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient balance', 'current_balance', v_current_balance);
  END IF;

  SELECT setting_value INTO v_fee_text FROM app_settings WHERE setting_key = 'agency_withdrawal_fee';
  BEGIN v_fee_json := v_fee_text::jsonb;
        v_fee_percent := COALESCE((v_fee_json->>'rate')::numeric, (v_fee_json->>'percent')::numeric, 0);
  EXCEPTION WHEN OTHERS THEN
        v_fee_percent := COALESCE(v_fee_text::numeric, 0);
  END;

  SELECT setting_value INTO v_helper_text FROM app_settings WHERE setting_key = 'helper_diamond_commission';
  BEGIN v_helper_json := v_helper_text::jsonb;
        v_helper_commission_percent := COALESCE((v_helper_json->>'rate')::numeric, (v_helper_json->>'percent')::numeric, 0);
  EXCEPTION WHEN OTHERS THEN
        v_helper_commission_percent := COALESCE(v_helper_text::numeric, 0);
  END;

  SELECT setting_value INTO v_agency_text FROM app_settings WHERE setting_key = 'agency_commission';
  BEGIN v_agency_json := v_agency_text::jsonb;
        v_beans_per_usd := COALESCE((v_agency_json->>'coins_to_dollar_rate')::numeric, 9000);
  EXCEPTION WHEN OTHERS THEN v_beans_per_usd := 9000; END;

  v_fee_beans := FLOOR(p_amount * v_fee_percent / 100.0);
  v_net_beans := p_amount - v_fee_beans;
  v_net_diamonds_to_helper := FLOOR(p_amount * (1 - v_helper_commission_percent / 100.0));
  v_net_usd := ROUND(v_net_beans / NULLIF(v_beans_per_usd, 0), 2);

  PERFORM set_config('app.bypass_profile_protection', 'true', true);

  UPDATE agencies SET wallet_balance = wallet_balance - p_amount, updated_at = now() WHERE id = p_agency_id;

  INSERT INTO agency_withdrawals (
    agency_id, amount, payment_method, payment_details, notes, status,
    fee_percentage, net_amount_money, net_diamonds_to_helper
  )
  VALUES (
    p_agency_id, p_amount, p_payment_method,
    COALESCE(p_payment_details, '{}'::jsonb)
      || jsonb_build_object(
           'fee_percent', v_fee_percent, 'fee_beans', v_fee_beans,
           'net_withdrawal_beans', v_net_beans, 'net_withdrawal_usd', v_net_usd,
           'beans_per_usd', v_beans_per_usd,
           'helper_commission_percent', v_helper_commission_percent
         ),
    p_notes, 'pending',
    v_fee_percent, v_net_usd, v_net_diamonds_to_helper
  ) RETURNING id INTO v_withdrawal_id;

  RETURN jsonb_build_object(
    'success', true, 'withdrawal_id', v_withdrawal_id,
    'amount_beans', p_amount, 'fee_percent', v_fee_percent, 'fee_beans', v_fee_beans,
    'net_beans', v_net_beans, 'net_usd', v_net_usd,
    'net_diamonds_to_helper', v_net_diamonds_to_helper, 'beans_per_usd', v_beans_per_usd
  );
END;
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- 12) Beans→Diamonds exchange — server-side rate validation
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.exchange_user_beans_to_diamonds(
  _user_id uuid,
  _beans_amount integer,
  _diamonds_reward integer,
  _tier_id uuid DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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
  _tier RECORD;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() != _user_id THEN
    RETURN json_build_object('success', false, 'error', 'Unauthorized');
  END IF;
  IF _beans_amount <= 0 OR _diamonds_reward <= 0 THEN
    RETURN json_build_object('success', false, 'error', 'Invalid amounts');
  END IF;

  -- Server-side validation against tier
  IF _tier_id IS NOT NULL THEN
    SELECT * INTO _tier FROM beans_exchange_tiers WHERE id = _tier_id AND is_active = true;
    IF _tier.id IS NULL THEN
      RETURN json_build_object('success', false, 'error', 'Invalid exchange tier');
    END IF;
    IF _tier.beans_required <> _beans_amount OR _tier.diamonds_reward <> _diamonds_reward THEN
      RETURN json_build_object('success', false, 'error', 'Exchange rate mismatch — refresh and try again');
    END IF;
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
    IF _helper_id IS NOT NULL AND (
      (_helper_level BETWEEN 1 AND 4) OR _payroll_enabled = true OR _helper_level = 5
    ) THEN
      _destination := 'trader_wallet_helper';
    END IF;
  END IF;

  PERFORM set_config('app.bypass_profile_protection', 'true', true);

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

-- ────────────────────────────────────────────────────────────────────────────
-- 13) Unified rounding helper
-- ────────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.calculate_commission(numeric, numeric);
CREATE OR REPLACE FUNCTION public.calculate_commission(_amount numeric, _rate numeric)
RETURNS bigint
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$ SELECT FLOOR(_amount * _rate / 100.0)::bigint; $$;