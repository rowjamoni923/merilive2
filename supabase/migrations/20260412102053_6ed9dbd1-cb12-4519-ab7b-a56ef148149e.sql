CREATE OR REPLACE FUNCTION public.current_user_id() RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$ SELECT auth.uid() $$;

CREATE OR REPLACE FUNCTION public.debug_distribute_test(p_category text, p_period_type text) RETURNS TABLE(step text, detail text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_start_date TIMESTAMPTZ;
  v_end_date TIMESTAMPTZ;
  v_period_label TEXT;
  v_count INTEGER := 0;
  v_already BOOLEAN;
BEGIN
  IF p_period_type = 'daily' THEN
    v_end_date := date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
    v_start_date := v_end_date - interval '1 day';
    v_period_label := 'daily_' || to_char(v_start_date, 'YYYY-MM-DD');
  ELSIF p_period_type = 'weekly' THEN
    v_end_date := date_trunc('week', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
    v_start_date := v_end_date - interval '1 week';
    v_period_label := 'weekly_' || to_char(v_start_date, 'YYYY-MM-DD');
  END IF;
  step := 'dates'; detail := v_start_date::text || ' -> ' || v_end_date::text || ' label=' || v_period_label;
  RETURN NEXT;
  SELECT EXISTS (SELECT 1 FROM leaderboard_reward_history WHERE category = p_category AND period_type = p_period_type AND period_label = v_period_label LIMIT 1) INTO v_already;
  step := 'idempotency'; detail := v_already::text;
  RETURN NEXT;
  IF p_category = 'host_earnings' THEN
    SELECT COUNT(*) INTO v_count FROM (
      WITH gift_stats AS (SELECT gt.receiver_id AS user_id, SUM(FLOOR(gt.coin_amount * 0.6)) AS total FROM gift_transactions gt INNER JOIN profiles p ON p.id = gt.receiver_id AND p.is_host = true WHERE gt.created_at >= v_start_date AND gt.created_at < v_end_date GROUP BY gt.receiver_id),
      call_stats AS (SELECT pc.host_id AS user_id, SUM(pc.host_earnings_amount) AS total FROM private_calls pc INNER JOIN profiles p ON p.id = pc.host_id AND p.is_host = true WHERE pc.created_at >= v_start_date AND pc.created_at < v_end_date AND pc.status = 'completed' GROUP BY pc.host_id),
      combined AS (SELECT COALESCE(g.user_id, c.user_id) AS user_id, COALESCE(g.total, 0) + COALESCE(c.total, 0) AS stat_value FROM gift_stats g FULL OUTER JOIN call_stats c ON g.user_id = c.user_id)
      SELECT user_id, stat_value FROM combined WHERE user_id IS NOT NULL AND stat_value > 0 ORDER BY stat_value DESC LIMIT 50
    ) sub;
    step := 'host_earnings_count'; detail := v_count::text;
    RETURN NEXT;
  END IF;
  SELECT COUNT(*) INTO v_count FROM leaderboard_reward_config WHERE category = p_category AND period_type = p_period_type AND is_active = true;
  step := 'reward_config_count'; detail := v_count::text;
  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.deduct_agency_wallet(p_agency_id uuid, p_amount integer) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_agency_balance INTEGER; v_helper_balance INTEGER; v_helper_id UUID; v_owner_id UUID;
  v_deducted_agency INTEGER; v_deducted_helper INTEGER; v_remaining INTEGER;
BEGIN
  SELECT owner_id INTO v_owner_id FROM agencies WHERE id = p_agency_id;
  IF auth.uid() IS NULL OR (auth.uid() != v_owner_id AND NOT public.is_admin(auth.uid())) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;
  SELECT wallet_balance, owner_id INTO v_agency_balance, v_owner_id FROM agencies WHERE id = p_agency_id FOR UPDATE;
  IF v_agency_balance IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Agency not found'); END IF;
  SELECT id, wallet_balance INTO v_helper_id, v_helper_balance FROM topup_helpers WHERE user_id = v_owner_id FOR UPDATE;
  v_helper_balance := COALESCE(v_helper_balance, 0); v_agency_balance := COALESCE(v_agency_balance, 0);
  IF (v_agency_balance + v_helper_balance) < p_amount THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient balance', 'agency_balance', v_agency_balance, 'helper_balance', v_helper_balance, 'total', v_agency_balance + v_helper_balance);
  END IF;
  v_remaining := p_amount; v_deducted_agency := 0; v_deducted_helper := 0;
  IF v_agency_balance >= v_remaining THEN v_deducted_agency := v_remaining; v_remaining := 0;
  ELSE v_deducted_agency := v_agency_balance; v_remaining := v_remaining - v_agency_balance; END IF;
  IF v_remaining > 0 AND v_helper_id IS NOT NULL THEN v_deducted_helper := v_remaining; v_remaining := 0; END IF;
  IF v_remaining > 0 THEN RETURN jsonb_build_object('success', false, 'error', 'Balance calculation error'); END IF;
  IF v_deducted_agency > 0 THEN UPDATE agencies SET wallet_balance = wallet_balance - v_deducted_agency, updated_at = now() WHERE id = p_agency_id; END IF;
  IF v_deducted_helper > 0 AND v_helper_id IS NOT NULL THEN UPDATE topup_helpers SET wallet_balance = wallet_balance - v_deducted_helper WHERE id = v_helper_id; END IF;
  RETURN jsonb_build_object('success', true, 'deducted_agency', v_deducted_agency, 'deducted_helper', v_deducted_helper, 'new_agency_balance', v_agency_balance - v_deducted_agency, 'new_helper_balance', v_helper_balance - v_deducted_helper);
END;
$$;

CREATE OR REPLACE FUNCTION public.deduct_coins_from_user(p_user_id uuid, p_amount integer) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE v_current integer;
BEGIN
  SELECT coins INTO v_current FROM profiles WHERE id = p_user_id FOR UPDATE;
  IF v_current < p_amount THEN RETURN false; END IF;
  PERFORM set_config('app.bypass_profile_protection', 'true', true);
  UPDATE profiles SET coins = coins - p_amount WHERE id = p_user_id;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.deduct_call_coins_per_minute(p_call_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  _call_record record; _caller_balance integer; _coins_to_deduct integer; _host_beans integer;
  _settings jsonb; _host_commission_percent integer; _time_since_last_billing integer;
  _call_duration_seconds integer; _grace_period_seconds integer; _is_first_minute boolean;
  _is_second_minute boolean; _first_minute_host_beans integer;
BEGIN
  SELECT * INTO _call_record FROM private_calls WHERE id = p_call_id FOR UPDATE;
  IF _call_record IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'call_not_found'); END IF;
  IF _call_record.status != 'connected' THEN RETURN jsonb_build_object('success', false, 'error', 'call_not_connected'); END IF;
  _call_duration_seconds := COALESCE(_call_record.duration_seconds, 0);
  _is_first_minute := _call_duration_seconds = 0;
  _is_second_minute := _call_duration_seconds = 60;
  IF _call_record.last_billing_at IS NOT NULL THEN
    _time_since_last_billing := EXTRACT(EPOCH FROM (now() - _call_record.last_billing_at))::integer;
    IF _time_since_last_billing < 50 THEN RETURN jsonb_build_object('success', true, 'skipped', true, 'reason', 'recently_billed'); END IF;
  END IF;
  SELECT setting_value INTO _settings FROM app_settings WHERE setting_key = 'call_rates';
  IF _settings IS NULL OR (_settings->>'host_commission_percent') IS NULL THEN _host_commission_percent := 0;
  ELSE _host_commission_percent := (_settings->>'host_commission_percent')::integer; END IF;
  IF _settings IS NULL OR (_settings->>'first_minute_grace_seconds') IS NULL THEN _grace_period_seconds := 21;
  ELSE _grace_period_seconds := (_settings->>'first_minute_grace_seconds')::integer; END IF;
  _coins_to_deduct := _call_record.coins_per_minute;
  _first_minute_host_beans := FLOOR(_coins_to_deduct * _host_commission_percent / 100);
  IF _is_first_minute THEN _host_beans := 0;
  ELSIF _is_second_minute THEN _host_beans := _first_minute_host_beans * 2;
  ELSE _host_beans := _first_minute_host_beans; END IF;
  SELECT coins INTO _caller_balance FROM profiles WHERE id = _call_record.caller_id;
  IF _caller_balance < _coins_to_deduct THEN
    IF _is_second_minute OR (_call_duration_seconds > 0 AND _call_record.host_earned = 0) THEN
      UPDATE profiles SET beans = COALESCE(beans, 0) + _first_minute_host_beans, weekly_earnings = COALESCE(weekly_earnings, 0) + _first_minute_host_beans, total_earnings = COALESCE(total_earnings, 0) + _first_minute_host_beans, updated_at = now() WHERE id = _call_record.host_id;
      UPDATE private_calls SET host_earned = COALESCE(host_earned, 0) + _first_minute_host_beans, host_earnings_amount = COALESCE(host_earnings_amount, 0) + _first_minute_host_beans WHERE id = p_call_id;
    END IF;
    UPDATE private_calls SET status = 'ended', ended_at = now(), end_reason = 'insufficient_coins' WHERE id = p_call_id;
    RETURN jsonb_build_object('success', false, 'error', 'insufficient_balance', 'caller_balance', _caller_balance, 'required', _coins_to_deduct, 'call_ended', true);
  END IF;
  UPDATE profiles SET coins = coins - _coins_to_deduct, updated_at = now() WHERE id = _call_record.caller_id;
  IF _host_beans > 0 THEN
    UPDATE profiles SET beans = COALESCE(beans, 0) + _host_beans, weekly_earnings = COALESCE(weekly_earnings, 0) + _host_beans, total_earnings = COALESCE(total_earnings, 0) + _host_beans, updated_at = now() WHERE id = _call_record.host_id;
  END IF;
  UPDATE private_calls SET coins_spent = COALESCE(coins_spent, 0) + _coins_to_deduct, total_coins_deducted = COALESCE(total_coins_deducted, 0) + _coins_to_deduct, host_earned = COALESCE(host_earned, 0) + _host_beans, host_earnings_amount = COALESCE(host_earnings_amount, 0) + _host_beans, duration_seconds = COALESCE(duration_seconds, 0) + 60, last_billing_at = now() WHERE id = p_call_id;
  RETURN jsonb_build_object('success', true, 'coins_deducted', _coins_to_deduct, 'host_beans', _host_beans, 'caller_balance', _caller_balance - _coins_to_deduct, 'duration_seconds', COALESCE(_call_record.duration_seconds, 0) + 60);
END;
$$;