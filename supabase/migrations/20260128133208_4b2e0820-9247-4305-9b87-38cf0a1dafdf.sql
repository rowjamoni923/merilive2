-- Update the process_weekly_agency_transfers function to include notifications
CREATE OR REPLACE FUNCTION process_weekly_agency_transfers()
RETURNS JSON
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
  _agency_commission NUMERIC;
  _total_transfers INT := 0;
  _total_amount NUMERIC := 0;
  _bd_time TIMESTAMPTZ;
  _period_start TIMESTAMPTZ;
  _level1_rate NUMERIC;
  _applicable_rate NUMERIC;
  _notification_id UUID;
  _agency_total_commission NUMERIC := 0;
BEGIN
  -- Get Bangladesh time (UTC+6)
  _bd_time := now() AT TIME ZONE 'Asia/Dhaka';
  _period_start := _bd_time - interval '7 days';
  
  RAISE NOTICE 'Starting weekly transfer at Bangladesh time: %', _bd_time;
  
  -- Get Level 1 call rate for resetting hosts
  SELECT COALESCE((lr->>'rate')::NUMERIC, 2000) INTO _level1_rate
  FROM app_settings,
  LATERAL jsonb_array_elements(setting_value->'level_rates') AS lr
  WHERE setting_key = 'call_rates' AND (lr->>'level')::INT = 1
  LIMIT 1;
  
  _level1_rate := COALESCE(_level1_rate, 2000);
  
  -- Loop through all active agencies
  FOR _agency IN 
    SELECT a.id, a.owner_id, a.name as agency_name, a.level
    FROM agencies a
    WHERE a.is_active = true AND a.is_blocked = false
  LOOP
    _agency_total_commission := 0;
    
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
      -- Calculate total earnings from all sources
      _total_host_earnings := COALESCE(_host.pending_earnings, 0) + 
                              COALESCE(_host.beans, 0) +
                              COALESCE(_host.total_earnings, 0) + 
                              COALESCE(_host.weekly_earnings, 0);
      
      -- Get gift earnings from this period for records
      SELECT COALESCE(SUM(coin_amount), 0) INTO _gift_earnings
      FROM gift_transactions
      WHERE receiver_id = _host.host_id
        AND created_at >= _period_start
        AND created_at <= now();
      
      -- Get call earnings from this period for records
      SELECT COALESCE(SUM(host_earned), 0) INTO _call_earnings
      FROM private_calls
      WHERE host_id = _host.host_id
        AND status = 'ended'
        AND created_at >= _period_start
        AND created_at <= now();
      
      IF _total_host_earnings > 0 THEN
        -- Get commission rate from agency_level_tiers based on host's earnings
        SELECT COALESCE(commission_rate, 2) INTO _applicable_rate
        FROM agency_level_tiers
        WHERE is_active = true
          AND _total_host_earnings >= min_weekly_income
          AND (_total_host_earnings <= max_weekly_income OR max_weekly_income >= 9999999999)
        ORDER BY min_weekly_income DESC
        LIMIT 1;
        
        -- Fallback to default 2% if no tier matches
        _applicable_rate := COALESCE(_applicable_rate, 2);
        
        -- Calculate agency commission
        _agency_commission := FLOOR(_total_host_earnings * _applicable_rate / 100);
        
        -- Create detailed transfer record
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
          'Host earnings: ' || _total_host_earnings || ' | Commission: ' || _agency_commission
        );
        
        -- Add FULL host earnings to agency beans_balance (for tracking)
        -- Add COMMISSION amount to agency wallet_balance (what agency actually earns)
        UPDATE agencies
        SET beans_balance = COALESCE(beans_balance, 0) + _total_host_earnings,
            wallet_balance = COALESCE(wallet_balance, 0) + _agency_commission
        WHERE id = _agency.id;
        
        -- CLEAR ALL host earnings and reset call rate to Level 1
        UPDATE profiles
        SET total_earnings = 0,
            pending_earnings = 0,
            weekly_earnings = 0,
            beans = 0,
            call_rate_per_minute = _level1_rate,
            host_level = 0
        WHERE id = _host.host_id;
        
        _total_transfers := _total_transfers + 1;
        _total_amount := _total_amount + _agency_commission;
        _agency_total_commission := _agency_total_commission + _agency_commission;
      END IF;
    END LOOP;
    
    -- Send notification to agency owner if they received any commission this week
    IF _agency_total_commission > 0 AND _agency.owner_id IS NOT NULL THEN
      INSERT INTO notifications (
        user_id,
        title,
        message,
        type,
        related_id,
        related_type,
        is_read,
        created_at
      ) VALUES (
        _agency.owner_id,
        '💰 সাপ্তাহিক কমিশন জমা হয়েছে!',
        'আপনার এজেন্সিতে এই সপ্তাহে ' || TO_CHAR(_agency_total_commission, 'FM999,999,999') || ' বিনস কমিশন জমা হয়েছে। হিস্টোরি দেখুন।',
        'commission',
        _agency.id::TEXT,
        'agency',
        false,
        now()
      );
    END IF;
  END LOOP;
  
  RETURN json_build_object(
    'success', true,
    'total_transfers', _total_transfers,
    'total_commission_earned', _total_amount,
    'processed_at_utc', now(),
    'processed_at_bd', _bd_time,
    'timezone', 'Asia/Dhaka (UTC+6)'
  );
END;
$$;