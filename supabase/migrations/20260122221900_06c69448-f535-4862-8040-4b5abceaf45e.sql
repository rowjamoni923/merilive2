-- Fix the process_weekly_agency_transfers function to include 'beans' (call earnings)
CREATE OR REPLACE FUNCTION public.process_weekly_agency_transfers()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _agency RECORD;
  _host RECORD;
  _base_commission_percent NUMERIC;
  _commission_tiers JSONB;
  _gift_earnings NUMERIC;
  _call_earnings NUMERIC;
  _total_host_beans NUMERIC;
  _agency_earnings NUMERIC;
  _total_transfers INT := 0;
  _total_amount NUMERIC := 0;
  _settings JSONB;
  _tier RECORD;
  _applicable_percent NUMERIC;
  _bd_time TIMESTAMPTZ;
  _period_start TIMESTAMPTZ;
BEGIN
  -- Get Bangladesh time (UTC+6)
  _bd_time := now() AT TIME ZONE 'Asia/Dhaka';
  _period_start := _bd_time - interval '7 days';
  
  RAISE NOTICE 'Starting weekly transfer at Bangladesh time: %', _bd_time;
  
  -- Get agency commission settings from app_settings
  SELECT setting_value INTO _settings
  FROM app_settings
  WHERE setting_key = 'agency_commission';
  
  -- Default to 2% if not set
  _base_commission_percent := COALESCE((_settings->>'agency_percent')::NUMERIC, 2);
  _commission_tiers := COALESCE(_settings->'commission_tiers', '[]'::JSONB);
  
  -- Loop through all active agencies
  FOR _agency IN 
    SELECT a.id, a.owner_id, a.commission_rate, a.name as agency_name
    FROM agencies a
    WHERE a.is_active = true AND a.is_blocked = false
  LOOP
    -- Loop through all hosts in this agency
    FOR _host IN
      SELECT 
        ah.host_id, 
        p.total_earnings,
        p.pending_earnings,
        p.weekly_earnings,
        p.beans,
        p.display_name,
        p.app_uid
      FROM agency_hosts ah
      JOIN profiles p ON p.id = ah.host_id
      WHERE ah.agency_id = _agency.id 
        AND ah.status = 'active'
    LOOP
      -- Calculate TOTAL beans from ALL sources including 'beans' field (call earnings)
      -- pending_earnings = gift earnings not yet transferred
      -- beans = call earnings not yet transferred  
      -- total_earnings and weekly_earnings are also included for backward compatibility
      _total_host_beans := COALESCE(_host.pending_earnings, 0) + 
                          COALESCE(_host.beans, 0) +
                          COALESCE(_host.total_earnings, 0) + 
                          COALESCE(_host.weekly_earnings, 0);
      
      -- Get gift earnings from this period for records
      SELECT COALESCE(SUM(coin_amount), 0) INTO _gift_earnings
      FROM gift_transactions
      WHERE receiver_id = _host.host_id
        AND created_at >= _period_start
        AND created_at <= now();
      
      -- Get call earnings from this period for records (from beans field updates)
      SELECT COALESCE(SUM(host_earned), 0) INTO _call_earnings
      FROM private_calls
      WHERE host_id = _host.host_id
        AND status = 'ended'
        AND created_at >= _period_start
        AND created_at <= now();
      
      IF _total_host_beans > 0 THEN
        -- Calculate applicable commission based on tiers
        _applicable_percent := _base_commission_percent;
        
        -- Check each tier and find the applicable one
        FOR _tier IN 
          SELECT * FROM jsonb_to_recordset(_commission_tiers) AS x(min_earnings NUMERIC, percent NUMERIC)
          ORDER BY min_earnings DESC
        LOOP
          IF _total_host_beans >= _tier.min_earnings THEN
            _applicable_percent := _tier.percent;
            EXIT;
          END IF;
        END LOOP;
        
        -- Calculate agency earnings (full beans go to agency, this is the commission part)
        _agency_earnings := FLOOR(_total_host_beans * _applicable_percent / 100);
        
        -- Create detailed transfer record with gift and call breakdown
        INSERT INTO agency_earnings_transfers (
          agency_id, host_id, amount, transfer_type, 
          period_start, period_end, status, processed_at,
          gift_earnings, call_earnings, host_uid, host_name, 
          agency_name, commission_rate, notes
        ) VALUES (
          _agency.id, _host.host_id, _total_host_beans, 'weekly',
          _period_start, _bd_time, 'completed', now(),
          _gift_earnings, _call_earnings, _host.app_uid, _host.display_name,
          _agency.agency_name, _applicable_percent,
          'Gift: ' || COALESCE(_host.pending_earnings, 0) || ', Calls: ' || COALESCE(_host.beans, 0) || ', Total: ' || _total_host_beans || ', Commission: ' || _agency_earnings
        );
        
        -- Add FULL beans to agency wallet_balance and beans_balance
        UPDATE agencies
        SET wallet_balance = COALESCE(wallet_balance, 0) + _total_host_beans,
            beans_balance = COALESCE(beans_balance, 0) + _total_host_beans
        WHERE id = _agency.id;
        
        -- CLEAR ALL host earnings including beans - NO beans remain in host account
        UPDATE profiles
        SET total_earnings = 0,
            pending_earnings = 0,
            weekly_earnings = 0,
            beans = 0
        WHERE id = _host.host_id;
        
        _total_transfers := _total_transfers + 1;
        _total_amount := _total_amount + _total_host_beans;
        
        RAISE NOTICE 'Transferred % beans (gifts: %, calls: %) from host % to agency % (Commission: %)', 
          _total_host_beans, COALESCE(_host.pending_earnings, 0), COALESCE(_host.beans, 0), 
          _host.display_name, _agency.agency_name, _agency_earnings;
      END IF;
    END LOOP;
  END LOOP;
  
  RETURN json_build_object(
    'success', true,
    'total_transfers', _total_transfers,
    'total_amount', _total_amount,
    'processed_at_utc', now(),
    'processed_at_bd', _bd_time,
    'timezone', 'Asia/Dhaka (UTC+6)'
  );
END;
$$;