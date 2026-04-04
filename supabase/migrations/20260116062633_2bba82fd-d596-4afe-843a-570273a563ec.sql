
-- Update the process function to use Bangladesh time
CREATE OR REPLACE FUNCTION public.process_weekly_agency_transfers()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  _agency RECORD;
  _host RECORD;
  _base_commission_percent NUMERIC;
  _commission_tiers JSONB;
  _host_earnings NUMERIC;
  _agency_earnings NUMERIC;
  _total_transfers INT := 0;
  _total_amount NUMERIC := 0;
  _settings JSONB;
  _tier RECORD;
  _applicable_percent NUMERIC;
  _bd_time TIMESTAMPTZ;
BEGIN
  -- Get Bangladesh time (UTC+6)
  _bd_time := now() AT TIME ZONE 'Asia/Dhaka';
  
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
    SELECT a.id, a.owner_id, a.commission_rate
    FROM agencies a
    WHERE a.is_active = true AND a.is_blocked = false
  LOOP
    -- Loop through all hosts in this agency
    FOR _host IN
      SELECT ah.host_id, p.total_earnings, p.pending_earnings
      FROM agency_hosts ah
      JOIN profiles p ON p.id = ah.host_id
      WHERE ah.agency_id = _agency.id 
        AND ah.status = 'active'
        AND COALESCE(p.total_earnings, 0) > 0
    LOOP
      _host_earnings := COALESCE(_host.total_earnings, 0);
      
      IF _host_earnings > 0 THEN
        -- Calculate applicable commission based on tiers
        _applicable_percent := _base_commission_percent;
        
        -- Check each tier and find the applicable one
        FOR _tier IN 
          SELECT * FROM jsonb_to_recordset(_commission_tiers) AS x(min_earnings NUMERIC, percent NUMERIC)
          ORDER BY min_earnings DESC
        LOOP
          IF _host_earnings >= _tier.min_earnings THEN
            _applicable_percent := _tier.percent;
            EXIT;
          END IF;
        END LOOP;
        
        -- Calculate agency commission from host earnings
        _agency_earnings := FLOOR(_host_earnings * _applicable_percent / 100);
        
        -- Create transfer record with Bangladesh time
        INSERT INTO agency_earnings_transfers (
          agency_id, host_id, amount, transfer_type, 
          period_start, period_end, status, processed_at
        ) VALUES (
          _agency.id, _host.host_id, _agency_earnings, 'weekly',
          (_bd_time - interval '7 days')::timestamptz, _bd_time, 'completed', now()
        );
        
        -- Add to agency wallet (beans_balance for commission)
        UPDATE agencies
        SET beans_balance = COALESCE(beans_balance, 0) + _agency_earnings
        WHERE id = _agency.id;
        
        -- Move host earnings to pending (for their own withdrawal)
        UPDATE profiles
        SET total_earnings = 0,
            pending_earnings = COALESCE(pending_earnings, 0) + COALESCE(total_earnings, 0)
        WHERE id = _host.host_id;
        
        _total_transfers := _total_transfers + 1;
        _total_amount := _total_amount + _agency_earnings;
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
$function$;
