-- Financial integrity hardening: unified commission sources, prevent duplicate rewards,
-- remove double-credit paths, and enforce safe game amount validation.

CREATE OR REPLACE FUNCTION public.get_effective_host_percent()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_setting jsonb;
  v_host numeric;
BEGIN
  -- 1) Canonical setting: host_percent
  SELECT setting_value INTO v_setting
  FROM app_settings
  WHERE setting_key = 'host_percent'
  ORDER BY updated_at DESC NULLS LAST
  LIMIT 1;

  IF v_setting IS NOT NULL THEN
    IF jsonb_typeof(v_setting) = 'number' THEN
      v_host := (v_setting::text)::numeric;
    ELSIF jsonb_typeof(v_setting) = 'object' THEN
      v_host := NULLIF(COALESCE(v_setting->>'host_percent', v_setting->>'hostPercent'), '')::numeric;
    END IF;
  END IF;

  -- 2) Fallback: gift_commission
  IF v_host IS NULL THEN
    SELECT setting_value INTO v_setting
    FROM app_settings
    WHERE setting_key = 'gift_commission'
    ORDER BY updated_at DESC NULLS LAST
    LIMIT 1;

    IF v_setting IS NOT NULL AND jsonb_typeof(v_setting) = 'object' THEN
      v_host := NULLIF(v_setting->>'host_percent', '')::numeric;
      IF v_host IS NULL AND (v_setting ? 'company_percent') THEN
        v_host := 100 - NULLIF(v_setting->>'company_percent', '')::numeric;
      END IF;
    END IF;
  END IF;

  -- 3) Fallback: call_rates.host_commission_percent
  IF v_host IS NULL THEN
    SELECT setting_value INTO v_setting
    FROM app_settings
    WHERE setting_key = 'call_rates'
    ORDER BY updated_at DESC NULLS LAST
    LIMIT 1;

    IF v_setting IS NOT NULL AND jsonb_typeof(v_setting) = 'object' THEN
      v_host := NULLIF(v_setting->>'host_commission_percent', '')::numeric;
    END IF;
  END IF;

  RETURN LEAST(100, GREATEST(0, COALESCE(v_host, 55)))::integer;
EXCEPTION WHEN OTHERS THEN
  RETURN 55;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_call_host_commission_percent()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_setting jsonb;
  v_host numeric;
BEGIN
  SELECT setting_value INTO v_setting
  FROM app_settings
  WHERE setting_key = 'call_rates'
  ORDER BY updated_at DESC NULLS LAST
  LIMIT 1;

  IF v_setting IS NOT NULL AND jsonb_typeof(v_setting) = 'object' THEN
    v_host := NULLIF(v_setting->>'host_commission_percent', '')::numeric;
  END IF;

  IF v_host IS NULL THEN
    SELECT setting_value INTO v_setting
    FROM app_settings
    WHERE setting_key = 'call_pricing'
    ORDER BY updated_at DESC NULLS LAST
    LIMIT 1;

    IF v_setting IS NOT NULL AND jsonb_typeof(v_setting) = 'object' THEN
      v_host := NULLIF(v_setting->>'host_commission_percent', '')::numeric;
    END IF;
  END IF;

  IF v_host IS NULL THEN
    RETURN public.get_effective_host_percent();
  END IF;

  RETURN LEAST(100, GREATEST(0, v_host))::integer;
EXCEPTION WHEN OTHERS THEN
  RETURN public.get_effective_host_percent();
END;
$$;

CREATE OR REPLACE FUNCTION public.process_gift_transaction(
  p_sender_id uuid,
  p_receiver_id uuid,
  p_gift_id uuid,
  p_quantity integer DEFAULT 1,
  p_stream_id uuid DEFAULT NULL,
  p_party_room_id uuid DEFAULT NULL,
  p_call_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_gift RECORD;
  v_sender RECORD;
  v_total_coins BIGINT;
  v_host_percent INT;
  v_beans_earned BIGINT;
  v_transaction_id UUID;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() != p_sender_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: You can only send gifts from your own account');
  END IF;

  IF COALESCE(p_quantity, 0) <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid quantity');
  END IF;

  SELECT id, name, coin_value, icon_url, animation_url
  INTO v_gift
  FROM gifts
  WHERE id = p_gift_id AND is_active = true;

  IF v_gift IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Gift not found or inactive');
  END IF;

  v_total_coins := v_gift.coin_value::BIGINT * p_quantity::BIGINT;

  SELECT id, coins INTO v_sender
  FROM profiles
  WHERE id = p_sender_id
  FOR UPDATE;

  IF v_sender IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Sender not found');
  END IF;

  IF v_sender.coins < v_total_coins THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient coins', 'required', v_total_coins, 'available', v_sender.coins);
  END IF;

  v_host_percent := public.get_effective_host_percent();
  v_beans_earned := FLOOR((v_total_coins::NUMERIC * v_host_percent) / 100)::BIGINT;

  UPDATE profiles
  SET coins = coins - v_total_coins,
      total_consumption = COALESCE(total_consumption, 0) + v_total_coins,
      updated_at = now()
  WHERE id = p_sender_id;

  UPDATE profiles
  SET beans = COALESCE(beans, 0) + v_beans_earned,
      pending_earnings = COALESCE(pending_earnings, 0) + v_beans_earned,
      total_earnings = COALESCE(total_earnings, 0) + v_beans_earned,
      updated_at = now()
  WHERE id = p_receiver_id;

  INSERT INTO gift_transactions (
    gift_id, sender_id, receiver_id, coin_amount, quantity,
    stream_id, party_room_id, call_id, created_at
  ) VALUES (
    p_gift_id, p_sender_id, p_receiver_id, v_total_coins, p_quantity,
    p_stream_id, p_party_room_id, p_call_id, now()
  )
  RETURNING id INTO v_transaction_id;

  IF p_stream_id IS NOT NULL THEN
    UPDATE live_streams
    SET total_gifts = COALESCE(total_gifts, 0) + 1,
        total_coins_earned = COALESCE(total_coins_earned, 0) + v_total_coins
    WHERE id = p_stream_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'transaction_id', v_transaction_id,
    'coins_spent', v_total_coins,
    'beans_earned', v_beans_earned,
    'host_percent', v_host_percent,
    'gift_name', v_gift.name,
    'gift_icon_url', v_gift.icon_url,
    'gift_animation_url', v_gift.animation_url
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

CREATE OR REPLACE FUNCTION public.auto_credit_agency_commission()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _host_agency_id UUID;
  _agency_level TEXT;
  _agency_commission_rate NUMERIC;
  _commission_amount NUMERIC;
  _host_earnings NUMERIC;
  _host_percent NUMERIC;
BEGIN
  SELECT ah.agency_id INTO _host_agency_id
  FROM agency_hosts ah
  WHERE ah.host_id = NEW.receiver_id
    AND ah.status = 'active'
  LIMIT 1;

  IF _host_agency_id IS NULL THEN
    RETURN NEW;
  END IF;

  _host_percent := public.get_effective_host_percent();

  SELECT a.level INTO _agency_level
  FROM agencies a
  WHERE a.id = _host_agency_id;

  SELECT COALESCE(alt.commission_rate, 3) INTO _agency_commission_rate
  FROM agency_level_tiers alt
  WHERE alt.level_code = COALESCE(_agency_level, 'A1')
    AND alt.is_active = true;

  _host_earnings := FLOOR(NEW.coin_amount * _host_percent / 100);
  _commission_amount := FLOOR(_host_earnings * COALESCE(_agency_commission_rate, 3) / 100);

  IF _commission_amount > 0 THEN
    UPDATE agencies
    SET beans_balance = COALESCE(beans_balance, 0) + _commission_amount
    WHERE id = _host_agency_id;

    INSERT INTO agency_commission_history (
      agency_id, host_id, transaction_type, original_amount,
      commission_rate, commission_amount, source_transaction_id, notes
    ) VALUES (
      _host_agency_id, NEW.receiver_id, 'gift', _host_earnings,
      COALESCE(_agency_commission_rate, 3), _commission_amount, NEW.id,
      'Auto commission from gift: ' || NEW.coin_amount || ' coins (host ' || _host_percent || '%)'
    );
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
  _agency_level TEXT;
  _agency_commission_rate NUMERIC;
  _commission_amount NUMERIC;
  _host_earnings NUMERIC;
BEGIN
  IF NEW.status NOT IN ('ended', 'completed') OR OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  SELECT ah.agency_id INTO _host_agency_id
  FROM agency_hosts ah
  WHERE ah.host_id = NEW.host_id
    AND ah.status = 'active'
  LIMIT 1;

  IF _host_agency_id IS NULL THEN
    RETURN NEW;
  END IF;

  _host_earnings := COALESCE(NEW.host_earned, FLOOR(COALESCE(NEW.coins_spent, 0) * public.get_call_host_commission_percent() / 100));

  SELECT a.level INTO _agency_level
  FROM agencies a
  WHERE a.id = _host_agency_id;

  SELECT COALESCE(alt.commission_rate, 3) INTO _agency_commission_rate
  FROM agency_level_tiers alt
  WHERE alt.level_code = COALESCE(_agency_level, 'A1')
    AND alt.is_active = true;

  _commission_amount := FLOOR(_host_earnings * COALESCE(_agency_commission_rate, 3) / 100);

  IF _commission_amount > 0 THEN
    UPDATE agencies
    SET beans_balance = COALESCE(beans_balance, 0) + _commission_amount
    WHERE id = _host_agency_id;

    INSERT INTO agency_commission_history (
      agency_id, host_id, transaction_type, original_amount,
      commission_rate, commission_amount, source_transaction_id, notes
    ) VALUES (
      _host_agency_id, NEW.host_id, 'call', _host_earnings,
      COALESCE(_agency_commission_rate, 3), _commission_amount, NEW.id,
      'Auto commission from call'
    );
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_host_earnings_on_gift()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _host_is_host BOOLEAN;
  _host_agency_id UUID;
  _period_start DATE;
  _host_earnings NUMERIC;
BEGIN
  SELECT is_host, agency_id INTO _host_is_host, _host_agency_id
  FROM public.profiles
  WHERE id = NEW.receiver_id;

  IF _host_is_host = true AND _host_agency_id IS NOT NULL THEN
    _host_earnings := FLOOR(NEW.coin_amount * public.get_effective_host_percent() / 100);
    _period_start := date_trunc('week', CURRENT_DATE)::date;

    INSERT INTO public.agency_performance (agency_id, period_type, period_start, total_income, golden_host_income)
    VALUES (_host_agency_id, 'weekly', _period_start, _host_earnings, _host_earnings)
    ON CONFLICT (agency_id, period_type, period_start)
    DO UPDATE SET
      total_income = agency_performance.total_income + _host_earnings,
      golden_host_income = agency_performance.golden_host_income + _host_earnings,
      updated_at = now();
  END IF;

  IF _host_is_host IS NOT TRUE THEN
    UPDATE public.profiles
    SET coins = COALESCE(coins, 0) + NEW.coin_amount
    WHERE id = NEW.receiver_id;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_host_call_earnings()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _host_is_host BOOLEAN;
  _beans_earned NUMERIC;
BEGIN
  IF NEW.status IN ('ended', 'completed') AND OLD.status IS DISTINCT FROM NEW.status THEN
    SELECT is_host INTO _host_is_host
    FROM public.profiles
    WHERE id = NEW.host_id;

    IF _host_is_host = true THEN
      _beans_earned := COALESCE(NEW.host_earned, 0);
      IF _beans_earned > 0 THEN
        UPDATE public.profiles
        SET pending_earnings = COALESCE(pending_earnings, 0) + _beans_earned,
            updated_at = now()
        WHERE id = NEW.host_id;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.place_game_bet(p_user_id uuid, p_amount integer, p_game_id text, p_game_name text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_current_balance INTEGER;
  v_new_balance INTEGER;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() != p_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  IF COALESCE(p_amount, 0) <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid bet amount');
  END IF;

  SELECT coins INTO v_current_balance FROM profiles WHERE id = p_user_id FOR UPDATE;
  IF v_current_balance IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'User not found');
  END IF;
  IF v_current_balance < p_amount THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient diamonds', 'balance', v_current_balance);
  END IF;

  v_new_balance := v_current_balance - p_amount;
  UPDATE profiles SET coins = v_new_balance, updated_at = now() WHERE id = p_user_id;

  INSERT INTO game_transactions (user_id, game_id, game_name, transaction_type, amount, balance_before, balance_after, details)
  VALUES (p_user_id, p_game_id, p_game_name, 'bet', p_amount, v_current_balance, v_new_balance, '{"action": "bet_placed"}'::jsonb);

  RETURN jsonb_build_object('success', true, 'new_balance', v_new_balance, 'deducted', p_amount);
END;
$$;

CREATE OR REPLACE FUNCTION public.process_game_win(
  p_user_id uuid,
  p_amount integer,
  p_game_id text,
  p_game_name text,
  p_multiplier numeric DEFAULT NULL,
  p_is_jackpot boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_current_balance INTEGER;
  v_new_balance INTEGER;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() != p_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  IF COALESCE(p_amount, 0) <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid win amount');
  END IF;

  SELECT coins INTO v_current_balance FROM profiles WHERE id = p_user_id FOR UPDATE;
  IF v_current_balance IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'User not found');
  END IF;

  v_new_balance := v_current_balance + p_amount;
  UPDATE profiles SET coins = v_new_balance, updated_at = now() WHERE id = p_user_id;

  INSERT INTO game_transactions (user_id, game_id, game_name, transaction_type, amount, balance_before, balance_after, multiplier, details)
  VALUES (
    p_user_id,
    p_game_id,
    p_game_name,
    CASE WHEN p_is_jackpot THEN 'jackpot' ELSE 'win' END,
    p_amount,
    v_current_balance,
    v_new_balance,
    p_multiplier,
    jsonb_build_object('action', CASE WHEN p_is_jackpot THEN 'jackpot_won' ELSE 'game_won' END)
  );

  RETURN jsonb_build_object('success', true, 'new_balance', v_new_balance, 'won', p_amount);
END;
$$;

CREATE OR REPLACE FUNCTION public.process_weekly_agency_transfers()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_result jsonb;
  v_processed_count integer := 0;
  v_total_host_earnings numeric := 0;
  v_total_commission numeric := 0;
  v_agency_record RECORD;
  v_period_start timestamp with time zone;
  v_period_end timestamp with time zone;
  v_correct_commission_rate numeric;
  v_host_sum numeric;
  v_commission_sum numeric;
BEGIN
  v_period_end := now();
  v_period_start := now() - interval '7 days';

  FOR v_agency_record IN
    SELECT a.id as agency_id, a.level as agency_level
    FROM agencies a
    WHERE a.is_active = true AND a.is_blocked IS NOT TRUE
  LOOP
    SELECT COALESCE(alt.commission_rate, 3)
    INTO v_correct_commission_rate
    FROM agency_level_tiers alt
    WHERE alt.level_code = COALESCE(v_agency_record.agency_level, 'A1')
      AND alt.is_active = true
    LIMIT 1;

    UPDATE agencies
    SET commission_rate = COALESCE(v_correct_commission_rate, 3),
        updated_at = now()
    WHERE id = v_agency_record.agency_id
      AND commission_rate IS DISTINCT FROM COALESCE(v_correct_commission_rate, 3);

    SELECT COALESCE(SUM(original_amount), 0), COALESCE(SUM(commission_amount), 0)
    INTO v_host_sum, v_commission_sum
    FROM agency_commission_history
    WHERE agency_id = v_agency_record.agency_id
      AND transaction_type IN ('gift', 'call')
      AND created_at >= v_period_start
      AND created_at < v_period_end;

    v_total_host_earnings := v_total_host_earnings + COALESCE(v_host_sum, 0);
    v_total_commission := v_total_commission + COALESCE(v_commission_sum, 0);
    v_processed_count := v_processed_count + 1;
  END LOOP;

  v_result := jsonb_build_object(
    'success', true,
    'processed_agencies', v_processed_count,
    'total_host_earnings', v_total_host_earnings,
    'total_commission', v_total_commission,
    'period_start', v_period_start,
    'period_end', v_period_end,
    'note', 'report_only_no_balance_mutation'
  );

  RETURN v_result;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS leaderboard_reward_history_user_period_unique
ON public.leaderboard_reward_history (user_id, category, period_type, period_label)
WHERE user_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS leaderboard_reward_history_agency_period_unique
ON public.leaderboard_reward_history (agency_id, category, period_type, period_label)
WHERE agency_id IS NOT NULL;