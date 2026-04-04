
-- FIX 1: deduct_call_coins_per_minute must also update host_earnings_amount (used by leaderboard & agency transfers)
CREATE OR REPLACE FUNCTION public.deduct_call_coins_per_minute(p_call_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _call_record record;
  _caller_balance integer;
  _coins_to_deduct integer;
  _host_beans integer;
  _settings jsonb;
  _host_commission_percent integer;
  _time_since_last_billing integer;
  _call_duration_seconds integer;
  _grace_period_seconds integer;
  _is_first_minute boolean;
  _is_second_minute boolean;
  _first_minute_host_beans integer;
BEGIN
  SELECT * INTO _call_record FROM private_calls WHERE id = p_call_id FOR UPDATE;
  
  IF _call_record IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'call_not_found');
  END IF;
  
  IF _call_record.status != 'connected' THEN
    RETURN jsonb_build_object('success', false, 'error', 'call_not_connected');
  END IF;
  
  _call_duration_seconds := COALESCE(_call_record.duration_seconds, 0);
  _is_first_minute := _call_duration_seconds = 0;
  _is_second_minute := _call_duration_seconds = 60;
  
  IF _call_record.last_billing_at IS NOT NULL THEN
    _time_since_last_billing := EXTRACT(EPOCH FROM (now() - _call_record.last_billing_at))::integer;
    IF _time_since_last_billing < 50 THEN
      RETURN jsonb_build_object('success', true, 'skipped', true, 'reason', 'recently_billed');
    END IF;
  END IF;
  
  SELECT setting_value INTO _settings FROM app_settings WHERE setting_key = 'call_rates';
  
  IF _settings IS NULL OR (_settings->>'host_commission_percent') IS NULL THEN
    RAISE WARNING 'CRITICAL: call_rates.host_commission_percent not configured!';
    _host_commission_percent := 0;
  ELSE
    _host_commission_percent := (_settings->>'host_commission_percent')::integer;
  END IF;
  
  IF _settings IS NULL OR (_settings->>'first_minute_grace_seconds') IS NULL THEN
    _grace_period_seconds := 21;
  ELSE
    _grace_period_seconds := (_settings->>'first_minute_grace_seconds')::integer;
  END IF;
  
  _coins_to_deduct := _call_record.coins_per_minute;
  _first_minute_host_beans := FLOOR(_coins_to_deduct * _host_commission_percent / 100);
  
  IF _is_first_minute THEN
    _host_beans := 0;
  ELSIF _is_second_minute THEN
    _host_beans := _first_minute_host_beans * 2;
  ELSE
    _host_beans := _first_minute_host_beans;
  END IF;
  
  SELECT coins INTO _caller_balance FROM profiles WHERE id = _call_record.caller_id;
  
  IF _caller_balance < _coins_to_deduct THEN
    IF _is_second_minute OR (_call_duration_seconds > 0 AND _call_record.host_earned = 0) THEN
      UPDATE profiles 
      SET beans = COALESCE(beans, 0) + _first_minute_host_beans,
          weekly_earnings = COALESCE(weekly_earnings, 0) + _first_minute_host_beans,
          total_earnings = COALESCE(total_earnings, 0) + _first_minute_host_beans,
          updated_at = now()
      WHERE id = _call_record.host_id;
      
      UPDATE private_calls 
      SET host_earned = COALESCE(host_earned, 0) + _first_minute_host_beans,
          host_earnings_amount = COALESCE(host_earnings_amount, 0) + _first_minute_host_beans
      WHERE id = p_call_id;
    END IF;
    
    UPDATE private_calls 
    SET status = 'ended', ended_at = now(), end_reason = 'insufficient_coins'
    WHERE id = p_call_id;
    
    RETURN jsonb_build_object('success', false, 'error', 'insufficient_balance', 'caller_balance', _caller_balance, 'required', _coins_to_deduct, 'call_ended', true);
  END IF;
  
  -- Deduct from caller
  UPDATE profiles 
  SET coins = coins - _coins_to_deduct, updated_at = now()
  WHERE id = _call_record.caller_id;
  
  -- Add beans to host
  IF _host_beans > 0 THEN
    UPDATE profiles 
    SET beans = COALESCE(beans, 0) + _host_beans,
        weekly_earnings = COALESCE(weekly_earnings, 0) + _host_beans,
        total_earnings = COALESCE(total_earnings, 0) + _host_beans,
        updated_at = now()
    WHERE id = _call_record.host_id;
  END IF;
  
  -- FIX: Update BOTH host_earned AND host_earnings_amount so leaderboard/agency queries work
  UPDATE private_calls
  SET 
    coins_spent = COALESCE(coins_spent, 0) + _coins_to_deduct,
    total_coins_deducted = COALESCE(total_coins_deducted, 0) + _coins_to_deduct,
    host_earned = COALESCE(host_earned, 0) + _host_beans,
    host_earnings_amount = COALESCE(host_earnings_amount, 0) + _host_beans,
    duration_seconds = COALESCE(duration_seconds, 0) + 60,
    last_billing_at = now()
  WHERE id = p_call_id;
  
  RETURN jsonb_build_object('success', true, 'coins_deducted', _coins_to_deduct, 'host_earned', _host_beans, 'commission_percent', _host_commission_percent, 'caller_remaining', _caller_balance - _coins_to_deduct, 'call_duration', _call_duration_seconds + 60, 'is_first_minute', _is_first_minute, 'is_second_minute', _is_second_minute, 'grace_period_seconds', _grace_period_seconds);
END;
$function$;

-- FIX 2: Leaderboard uses status='completed' but calls end with status='ended'
-- Update leaderboard to check for 'ended' status (which is the actual status used)
CREATE OR REPLACE FUNCTION public.get_host_earnings_leaderboard(p_period_type text DEFAULT 'weekly')
RETURNS TABLE(id uuid, display_name text, app_uid character varying, avatar_url text, country_flag text, host_level integer, user_level integer, frame_id uuid, stat_value bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_start_date timestamptz;
BEGIN
  IF p_period_type = 'daily' THEN v_start_date := date_trunc('day', now());
  ELSIF p_period_type = 'weekly' THEN v_start_date := date_trunc('week', now());
  ELSE v_start_date := date_trunc('month', now()); END IF;

  RETURN QUERY
  WITH gift_earnings AS (
    SELECT gt.receiver_id AS uid, COALESCE(SUM(FLOOR(gt.coin_amount * 0.6)), 0)::bigint AS beans
    FROM gift_transactions gt
    WHERE gt.created_at >= v_start_date 
    GROUP BY gt.receiver_id
  ),
  call_earnings AS (
    -- FIX: Include both 'ended' and 'completed' statuses, use COALESCE for host_earnings_amount/host_earned
    SELECT pc.host_id AS uid, COALESCE(SUM(COALESCE(pc.host_earnings_amount, pc.host_earned, 0)), 0)::bigint AS beans
    FROM private_calls pc
    WHERE pc.created_at >= v_start_date AND pc.status IN ('ended', 'completed', 'connected')
    GROUP BY pc.host_id
  ),
  combined AS (
    SELECT COALESCE(g.uid, c.uid) AS uid, (COALESCE(g.beans, 0) + COALESCE(c.beans, 0))::bigint AS total_beans
    FROM gift_earnings g FULL OUTER JOIN call_earnings c ON g.uid = c.uid
  )
  SELECT p.id, p.display_name, p.app_uid, p.avatar_url, p.country_flag, p.host_level, p.user_level, p.frame_id,
         cm.total_beans AS stat_value
  FROM combined cm INNER JOIN profiles p ON p.id = cm.uid
  WHERE cm.total_beans > 0 ORDER BY cm.total_beans DESC LIMIT 50;
END; $function$;

-- FIX 3: Backfill existing private_calls where host_earnings_amount is NULL but host_earned is set
UPDATE private_calls 
SET host_earnings_amount = host_earned 
WHERE host_earned > 0 AND (host_earnings_amount IS NULL OR host_earnings_amount = 0);
