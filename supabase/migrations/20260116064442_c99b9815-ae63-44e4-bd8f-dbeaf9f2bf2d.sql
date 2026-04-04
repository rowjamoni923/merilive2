
-- Update agency_earnings_transfers table to include more details
ALTER TABLE agency_earnings_transfers 
ADD COLUMN IF NOT EXISTS gift_earnings NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS call_earnings NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS host_uid TEXT,
ADD COLUMN IF NOT EXISTS host_name TEXT,
ADD COLUMN IF NOT EXISTS agency_name TEXT,
ADD COLUMN IF NOT EXISTS commission_rate NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS notes TEXT;

-- Update the process_weekly_agency_transfers function to include call + gift earnings
CREATE OR REPLACE FUNCTION public.process_weekly_agency_transfers()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _agency RECORD;
  _host RECORD;
  _base_commission_percent NUMERIC;
  _commission_tiers JSONB;
  _gift_earnings NUMERIC;
  _call_earnings NUMERIC;
  _total_host_earnings NUMERIC;
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
        p.display_name,
        p.uid
      FROM agency_hosts ah
      JOIN profiles p ON p.id = ah.host_id
      WHERE ah.agency_id = _agency.id 
        AND ah.status = 'active'
    LOOP
      -- Calculate gift earnings (from gift_transactions in this period)
      SELECT COALESCE(SUM(coin_amount), 0) INTO _gift_earnings
      FROM gift_transactions
      WHERE receiver_id = _host.host_id
        AND created_at >= _period_start
        AND created_at <= _bd_time;
      
      -- Calculate call earnings (from private_calls in this period)
      SELECT COALESCE(SUM(host_earnings_amount), 0) INTO _call_earnings
      FROM private_calls
      WHERE host_id = _host.host_id
        AND host_earnings_credited = true
        AND created_at >= _period_start
        AND created_at <= _bd_time;
      
      _total_host_earnings := _gift_earnings + _call_earnings;
      
      IF _total_host_earnings > 0 THEN
        -- Calculate applicable commission based on tiers
        _applicable_percent := _base_commission_percent;
        
        -- Check each tier and find the applicable one
        FOR _tier IN 
          SELECT * FROM jsonb_to_recordset(_commission_tiers) AS x(min_earnings NUMERIC, percent NUMERIC)
          ORDER BY min_earnings DESC
        LOOP
          IF _total_host_earnings >= _tier.min_earnings THEN
            _applicable_percent := _tier.percent;
            EXIT;
          END IF;
        END LOOP;
        
        -- Calculate agency commission from host earnings
        _agency_earnings := FLOOR(_total_host_earnings * _applicable_percent / 100);
        
        -- Create detailed transfer record with Bangladesh time
        INSERT INTO agency_earnings_transfers (
          agency_id, host_id, amount, transfer_type, 
          period_start, period_end, status, processed_at,
          gift_earnings, call_earnings, host_uid, host_name, 
          agency_name, commission_rate
        ) VALUES (
          _agency.id, _host.host_id, _agency_earnings, 'weekly',
          _period_start, _bd_time, 'completed', now(),
          _gift_earnings, _call_earnings, _host.uid, _host.display_name,
          _agency.agency_name, _applicable_percent
        );
        
        -- Add to agency wallet (beans_balance for commission)
        UPDATE agencies
        SET beans_balance = COALESCE(beans_balance, 0) + _agency_earnings
        WHERE id = _agency.id;
        
        -- Update host pending earnings
        UPDATE profiles
        SET pending_earnings = COALESCE(pending_earnings, 0) + _total_host_earnings
        WHERE id = _host.host_id;
        
        _total_transfers := _total_transfers + 1;
        _total_amount := _total_amount + _agency_earnings;
        
        RAISE NOTICE 'Transferred % to agency % for host % (Gift: %, Call: %)', 
          _agency_earnings, _agency.agency_name, _host.display_name, _gift_earnings, _call_earnings;
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
