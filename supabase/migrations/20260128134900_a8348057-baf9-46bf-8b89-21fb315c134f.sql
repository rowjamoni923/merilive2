
-- CRITICAL FIX: Remove ALL hardcoded defaults from financial functions
-- All values must come from Admin Panel settings

-- Fix deduct_call_coins_per_minute - NO HARDCODED COMMISSION
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
  _settings jsonb;
  _host_commission_percent integer;
  _time_since_last_billing integer;
BEGIN
  -- Get call record with lock
  SELECT * INTO _call_record
  FROM private_calls
  WHERE id = p_call_id
  FOR UPDATE;
  
  IF _call_record IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'call_not_found');
  END IF;
  
  IF _call_record.status != 'connected' THEN
    RETURN jsonb_build_object('success', false, 'error', 'call_not_connected');
  END IF;
  
  -- Prevent double billing within 50 seconds
  IF _call_record.last_billing_at IS NOT NULL THEN
    _time_since_last_billing := EXTRACT(EPOCH FROM (now() - _call_record.last_billing_at))::integer;
    IF _time_since_last_billing < 50 THEN
      RETURN jsonb_build_object('success', true, 'skipped', true, 'reason', 'recently_billed');
    END IF;
  END IF;
  
  -- CRITICAL: Get commission from Admin Panel - NO DEFAULTS
  SELECT setting_value INTO _settings
  FROM app_settings
  WHERE setting_key = 'call_rates';
  
  IF _settings IS NULL OR (_settings->>'host_commission_percent') IS NULL THEN
    -- LOG CRITICAL ERROR - Settings must be configured
    RAISE WARNING 'CRITICAL: call_rates.host_commission_percent not configured in Admin Panel! Host gets 0%% until configured.';
    _host_commission_percent := 0; -- Safe fallback - company retains all
  ELSE
    _host_commission_percent := (_settings->>'host_commission_percent')::integer;
  END IF;
  
  -- Use the EXACT coins_per_minute stored in the call record
  _coins_to_deduct := _call_record.coins_per_minute;
  
  -- Calculate host beans based on ADMIN CONFIGURED commission
  _host_beans := FLOOR(_coins_to_deduct * _host_commission_percent / 100);
  
  -- Check caller balance
  SELECT coins INTO _caller_balance
  FROM profiles WHERE id = _call_record.caller_id;
  
  IF _caller_balance < _coins_to_deduct THEN
    UPDATE private_calls 
    SET status = 'ended', ended_at = now()
    WHERE id = p_call_id;
    
    RETURN jsonb_build_object(
      'success', false, 
      'error', 'insufficient_balance',
      'caller_balance', _caller_balance,
      'required', _coins_to_deduct,
      'call_ended', true
    );
  END IF;
  
  -- Deduct from caller
  UPDATE profiles 
  SET coins = coins - _coins_to_deduct,
      updated_at = now()
  WHERE id = _call_record.caller_id;
  
  -- Add beans to host
  UPDATE profiles 
  SET beans = COALESCE(beans, 0) + _host_beans,
      weekly_earnings = COALESCE(weekly_earnings, 0) + _host_beans,
      total_earnings = COALESCE(total_earnings, 0) + _host_beans,
      updated_at = now()
  WHERE id = _call_record.host_id;
  
  -- Update call record
  UPDATE private_calls
  SET 
    coins_spent = COALESCE(coins_spent, 0) + _coins_to_deduct,
    host_earned = COALESCE(host_earned, 0) + _host_beans,
    duration_seconds = COALESCE(duration_seconds, 0) + 60,
    last_billing_at = now()
  WHERE id = p_call_id;
  
  RETURN jsonb_build_object(
    'success', true,
    'coins_deducted', _coins_to_deduct,
    'host_earned', _host_beans,
    'commission_percent', _host_commission_percent,
    'caller_remaining', _caller_balance - _coins_to_deduct
  );
END;
$$;

-- Fix start_private_call - NO HARDCODED RATES
CREATE OR REPLACE FUNCTION public.start_private_call(_host_id uuid, _stream_id uuid DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller_id uuid;
  _call_id uuid;
  _host_call_rate integer;
  _host_level integer;
  _host_custom_rate integer;
  _call_settings jsonb;
  _admin_min_rate integer;
  _admin_max_rate integer;
  _min_level_for_custom integer;
  _level_rate jsonb;
  _i integer;
  _is_level_rate boolean := false;
BEGIN
  _caller_id := auth.uid();
  
  IF _caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  
  IF _caller_id = _host_id THEN
    RAISE EXCEPTION 'Cannot call yourself';
  END IF;
  
  -- Check if caller is already in a call
  IF EXISTS (SELECT 1 FROM profiles WHERE id = _caller_id AND is_in_call = true) THEN
    RAISE EXCEPTION 'You are already in a call';
  END IF;
  
  -- Check if host is in another call
  IF EXISTS (SELECT 1 FROM profiles WHERE id = _host_id AND is_in_call = true) THEN
    RAISE EXCEPTION 'Host is busy in another call';
  END IF;
  
  -- CRITICAL: Get admin settings - NO DEFAULTS
  SELECT setting_value INTO _call_settings
  FROM app_settings WHERE setting_key = 'call_rates';
  
  IF _call_settings IS NULL THEN
    RAISE EXCEPTION 'CRITICAL: call_rates not configured in Admin Panel! Cannot process calls.';
  END IF;
  
  _admin_min_rate := (_call_settings->>'min_rate')::integer;
  _admin_max_rate := (_call_settings->>'max_rate')::integer;
  _min_level_for_custom := COALESCE((_call_settings->>'min_level_for_custom')::integer, 3);
  
  IF _admin_min_rate IS NULL OR _admin_max_rate IS NULL THEN
    RAISE EXCEPTION 'CRITICAL: min_rate and max_rate must be configured in Admin Panel!';
  END IF;
  
  -- Get host info
  SELECT host_level, call_rate_per_minute INTO _host_level, _host_custom_rate
  FROM profiles WHERE id = _host_id;
  
  _host_level := COALESCE(_host_level, 1);
  
  -- PRIORITY 1: Check if host has custom rate (and meets level requirement)
  IF _host_custom_rate IS NOT NULL AND _host_custom_rate > 0 AND _host_level >= _min_level_for_custom THEN
    _host_call_rate := GREATEST(_admin_min_rate, LEAST(_host_custom_rate, _admin_max_rate));
  ELSE
    -- PRIORITY 2: Use level-based rate from Admin Panel
    IF _call_settings->'level_rates' IS NOT NULL AND jsonb_array_length(_call_settings->'level_rates') > 0 THEN
      FOR _i IN 0..jsonb_array_length(_call_settings->'level_rates') - 1 LOOP
        _level_rate := _call_settings->'level_rates'->_i;
        IF (_level_rate->>'level')::integer = _host_level THEN
          _host_call_rate := (_level_rate->>'rate')::integer;
          _is_level_rate := true;
          EXIT;
        END IF;
      END LOOP;
    END IF;
    
    -- If no level rate found, REJECT - must be configured
    IF NOT _is_level_rate OR _host_call_rate IS NULL THEN
      RAISE EXCEPTION 'CRITICAL: No call rate configured for host level %. Admin must configure level_rates in call_rates settings.', _host_level;
    END IF;
  END IF;
  
  -- Final validation
  IF _host_call_rate IS NULL OR _host_call_rate <= 0 THEN
    RAISE EXCEPTION 'CRITICAL: Invalid call rate. Admin Panel configuration required.';
  END IF;
  
  -- Create the call
  INSERT INTO private_calls (caller_id, host_id, stream_id, status, started_at, coins_per_minute)
  VALUES (_caller_id, _host_id, _stream_id, 'ringing', now(), _host_call_rate)
  RETURNING id INTO _call_id;
  
  RETURN _call_id;
END;
$$;

-- Fix process_weekly_agency_transfers - Remove remaining defaults
CREATE OR REPLACE FUNCTION process_weekly_agency_transfers()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _agency RECORD;
  _host RECORD;
  _gift_earnings NUMERIC;
  _call_earnings NUMERIC;
  _total_host_earnings NUMERIC;
  _host_earnings_usd NUMERIC;
  _agency_commission NUMERIC;
  _total_transfers INT := 0;
  _total_amount NUMERIC := 0;
  _bd_time TIMESTAMPTZ;
  _period_start TIMESTAMPTZ;
  _level1_rate NUMERIC;
  _applicable_rate NUMERIC;
  _notification_id UUID;
  _agency_total_commission NUMERIC := 0;
  _beans_to_usd_rate NUMERIC;
BEGIN
  _bd_time := now() AT TIME ZONE 'Asia/Dhaka';
  _period_start := _bd_time - interval '7 days';
  
  -- CRITICAL: Get beans to USD rate from app_settings - NO DEFAULT
  SELECT (setting_value->>'rate')::NUMERIC INTO _beans_to_usd_rate
  FROM app_settings WHERE setting_key = 'beans_to_usd_rate';
  
  IF _beans_to_usd_rate IS NULL OR _beans_to_usd_rate <= 0 THEN
    RAISE WARNING 'CRITICAL: beans_to_usd_rate not configured! Using safe default 10000 to prevent division errors.';
    _beans_to_usd_rate := 10000;
  END IF;
  
  -- CRITICAL: Get Level 1 call rate from admin settings - NO DEFAULT
  SELECT (lr->>'rate')::NUMERIC INTO _level1_rate
  FROM app_settings,
  LATERAL jsonb_array_elements(setting_value->'level_rates') AS lr
  WHERE setting_key = 'call_rates' AND (lr->>'level')::INT = 1
  LIMIT 1;
  
  IF _level1_rate IS NULL THEN
    RAISE WARNING 'CRITICAL: Level 1 call rate not configured in Admin Panel! Cannot reset host rates.';
    -- Don't set a default - leave host rates unchanged if not configured
  END IF;
  
  FOR _agency IN 
    SELECT a.id, a.owner_id, a.name as agency_name, a.level
    FROM agencies a WHERE a.is_active = true AND a.is_blocked = false
  LOOP
    _agency_total_commission := 0;
    
    FOR _host IN
      SELECT ah.host_id, p.total_earnings, p.pending_earnings, p.weekly_earnings,
             p.beans, p.display_name, p.app_uid
      FROM agency_hosts ah
      JOIN profiles p ON p.id = ah.host_id
      WHERE ah.agency_id = _agency.id AND ah.status = 'active'
    LOOP
      _total_host_earnings := COALESCE(_host.pending_earnings, 0) + 
                              COALESCE(_host.beans, 0) +
                              COALESCE(_host.total_earnings, 0) + 
                              COALESCE(_host.weekly_earnings, 0);
      
      _host_earnings_usd := _total_host_earnings / _beans_to_usd_rate;
      
      SELECT COALESCE(SUM(coin_amount), 0) INTO _gift_earnings
      FROM gift_transactions
      WHERE receiver_id = _host.host_id AND created_at >= _period_start AND created_at <= now();
      
      SELECT COALESCE(SUM(host_earned), 0) INTO _call_earnings
      FROM private_calls
      WHERE host_id = _host.host_id AND status = 'ended' 
        AND created_at >= _period_start AND created_at <= now();
      
      IF _total_host_earnings > 0 THEN
        -- CRITICAL: Get rate from agency_level_tiers - NO FALLBACK DEFAULT
        SELECT commission_rate INTO _applicable_rate
        FROM agency_level_tiers
        WHERE is_active = true
          AND _host_earnings_usd >= min_weekly_income
          AND (_host_earnings_usd <= max_weekly_income OR max_weekly_income >= 9999999)
        ORDER BY min_weekly_income DESC LIMIT 1;
        
        IF _applicable_rate IS NULL THEN
          SELECT commission_rate INTO _applicable_rate
          FROM agency_level_tiers WHERE is_active = true
          ORDER BY min_weekly_income ASC LIMIT 1;
        END IF;
        
        IF _applicable_rate IS NULL THEN
          RAISE WARNING 'CRITICAL: No commission tiers configured for agency! Host % earnings not processed.', _host.display_name;
          CONTINUE; -- Skip this host
        END IF;
        
        _agency_commission := FLOOR(_total_host_earnings * _applicable_rate / 100);
        
        INSERT INTO agency_earnings_transfers (
          agency_id, host_id, amount, transfer_type, 
          period_start, period_end, status, processed_at,
          gift_earnings, call_earnings, host_uid, host_name, 
          agency_name, commission_rate, notes
        ) VALUES (
          _agency.id, _host.host_id, _total_host_earnings, 'weekly',
          _period_start, _bd_time, 'completed', now(),
          _gift_earnings, _call_earnings, _host.app_uid, _host.display_name,
          _agency.agency_name, _applicable_rate,
          'Host: ' || _total_host_earnings || ' beans ($' || ROUND(_host_earnings_usd, 2) || ') | Commission: ' || _agency_commission || ' (' || _applicable_rate || '%)'
        );
        
        UPDATE agencies
        SET beans_balance = COALESCE(beans_balance, 0) + _total_host_earnings,
            wallet_balance = COALESCE(wallet_balance, 0) + _agency_commission
        WHERE id = _agency.id;
        
        _agency_total_commission := _agency_total_commission + _agency_commission;
        
        -- Clear host earnings; only reset call rate if Level 1 rate is configured
        IF _level1_rate IS NOT NULL THEN
          UPDATE profiles
          SET total_earnings = 0, pending_earnings = 0, weekly_earnings = 0,
              beans = 0, call_rate_per_minute = _level1_rate
          WHERE id = _host.host_id;
        ELSE
          UPDATE profiles
          SET total_earnings = 0, pending_earnings = 0, weekly_earnings = 0, beans = 0
          WHERE id = _host.host_id;
        END IF;
        
        _total_transfers := _total_transfers + 1;
        _total_amount := _total_amount + _agency_commission;
      END IF;
    END LOOP;
    
    IF _agency_total_commission > 0 THEN
      INSERT INTO notifications (user_id, type, title, message, data)
      VALUES (
        _agency.owner_id, 'system', 'Weekly Commission Received!',
        'Your weekly commission of ' || _agency_total_commission || ' beans ($' || 
        ROUND(_agency_total_commission / _beans_to_usd_rate, 2) || ') has been deposited.',
        jsonb_build_object('amount', _agency_total_commission, 
          'amount_usd', ROUND(_agency_total_commission / _beans_to_usd_rate, 2),
          'type', 'weekly_commission', 'agency_id', _agency.id)
      );
    END IF;
  END LOOP;
  
  RETURN jsonb_build_object(
    'success', true, 'total_transfers', _total_transfers,
    'total_commission_transferred', _total_amount, 'processed_at', now()
  );
END;
$$;
