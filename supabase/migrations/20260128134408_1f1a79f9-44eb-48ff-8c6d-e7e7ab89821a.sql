
-- First drop the existing function, then recreate with proper USD conversion
DROP FUNCTION IF EXISTS process_weekly_agency_transfers();

-- Recreate with proper beans-to-USD conversion for tier matching
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
  _beans_to_usd_rate NUMERIC := 10000;
BEGIN
  _bd_time := now() AT TIME ZONE 'Asia/Dhaka';
  _period_start := _bd_time - interval '7 days';
  
  -- Get beans to USD rate from app_settings (DYNAMIC - no hardcoded default used)
  SELECT COALESCE((setting_value->>'rate')::NUMERIC, 10000) INTO _beans_to_usd_rate
  FROM app_settings WHERE setting_key = 'beans_to_usd_rate';
  _beans_to_usd_rate := COALESCE(_beans_to_usd_rate, 10000);
  
  -- Get Level 1 call rate from admin settings (DYNAMIC)
  SELECT COALESCE((lr->>'rate')::NUMERIC, 2000) INTO _level1_rate
  FROM app_settings,
  LATERAL jsonb_array_elements(setting_value->'level_rates') AS lr
  WHERE setting_key = 'call_rates' AND (lr->>'level')::INT = 1
  LIMIT 1;
  _level1_rate := COALESCE(_level1_rate, 2000);
  
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
      
      -- CRITICAL FIX: Convert beans to USD for tier matching
      _host_earnings_usd := _total_host_earnings / _beans_to_usd_rate;
      
      SELECT COALESCE(SUM(coin_amount), 0) INTO _gift_earnings
      FROM gift_transactions
      WHERE receiver_id = _host.host_id AND created_at >= _period_start AND created_at <= now();
      
      SELECT COALESCE(SUM(host_earned), 0) INTO _call_earnings
      FROM private_calls
      WHERE host_id = _host.host_id AND status = 'ended' 
        AND created_at >= _period_start AND created_at <= now();
      
      IF _total_host_earnings > 0 THEN
        -- Match tier using USD value against agency_level_tiers (which stores USD ranges)
        SELECT COALESCE(commission_rate, 3) INTO _applicable_rate
        FROM agency_level_tiers
        WHERE is_active = true
          AND _host_earnings_usd >= min_weekly_income
          AND (_host_earnings_usd <= max_weekly_income OR max_weekly_income >= 9999999)
        ORDER BY min_weekly_income DESC LIMIT 1;
        
        -- Fallback to lowest tier if no match
        IF _applicable_rate IS NULL THEN
          SELECT COALESCE(commission_rate, 3) INTO _applicable_rate
          FROM agency_level_tiers WHERE is_active = true
          ORDER BY min_weekly_income ASC LIMIT 1;
        END IF;
        _applicable_rate := COALESCE(_applicable_rate, 3);
        
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
        
        UPDATE profiles
        SET total_earnings = 0, pending_earnings = 0, weekly_earnings = 0,
            beans = 0, call_rate_per_minute = _level1_rate
        WHERE id = _host.host_id;
        
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
