
-- FIX 1: Gift commission trigger - read host_percent from app_settings instead of hardcoded 40%
CREATE OR REPLACE FUNCTION public.auto_credit_agency_commission()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _host_agency_id UUID;
  _agency_level TEXT;
  _agency_commission_rate NUMERIC;
  _commission_amount NUMERIC;
  _host_earnings NUMERIC;
  _host_percent NUMERIC;
BEGIN
  -- Get host's agency
  SELECT ah.agency_id INTO _host_agency_id
  FROM agency_hosts ah
  WHERE ah.host_id = NEW.receiver_id
    AND ah.status = 'active'
  LIMIT 1;
  
  IF _host_agency_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Read host_percent from app_settings (NOT hardcoded)
  SELECT COALESCE((setting_value)::NUMERIC, 55)
  INTO _host_percent
  FROM app_settings
  WHERE setting_key = 'host_percent';

  IF _host_percent IS NULL THEN
    _host_percent := 55;
  END IF;
  
  -- Get agency level and commission rate from agency_level_tiers
  SELECT a.level INTO _agency_level
  FROM agencies a
  WHERE a.id = _host_agency_id;
  
  SELECT COALESCE(alt.commission_rate, 3) INTO _agency_commission_rate
  FROM agency_level_tiers alt
  WHERE alt.level_code = COALESCE(_agency_level, 'A1')
    AND alt.is_active = true;
  
  IF _agency_commission_rate IS NULL THEN
    _agency_commission_rate := 3;
  END IF;
  
  -- Calculate host earnings using dynamic host_percent from settings
  _host_earnings := FLOOR(NEW.coin_amount * _host_percent / 100);
  
  -- Calculate agency commission from host earnings
  _commission_amount := FLOOR(_host_earnings * _agency_commission_rate / 100);
  
  IF _commission_amount > 0 THEN
    UPDATE agencies
    SET beans_balance = COALESCE(beans_balance, 0) + _commission_amount
    WHERE id = _host_agency_id;
    
    INSERT INTO agency_commission_history (
      agency_id, host_id, transaction_type, original_amount,
      commission_rate, commission_amount, source_transaction_id, notes
    ) VALUES (
      _host_agency_id, NEW.receiver_id, 'gift', _host_earnings,
      _agency_commission_rate, _commission_amount, NEW.id,
      'Auto commission from gift: ' || NEW.coin_amount || ' coins (host ' || _host_percent || '%) @ ' || _agency_commission_rate || '%'
    );
  END IF;
  
  RETURN NEW;
END;
$$;

-- FIX 2: Weekly transfer - REMOVE duplicate commission bonus
-- Agency already receives real-time commission on every gift/call via triggers above
-- Weekly transfer should ONLY move host earnings to agency, no extra commission
CREATE OR REPLACE FUNCTION public.process_weekly_agency_transfers()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
  v_processed_count integer := 0;
  v_total_host_earnings numeric := 0;
  v_agency_record RECORD;
  v_host_record RECORD;
  v_host_earnings numeric;
  v_period_start timestamp with time zone;
  v_period_end timestamp with time zone;
  v_agency_total_income numeric;
BEGIN
  -- Set bypass flag for trigger protection
  PERFORM set_config('app.bypass_profile_protection', 'true', true);

  v_period_end := now();
  v_period_start := now() - interval '7 days';

  FOR v_agency_record IN 
    SELECT 
      a.id as agency_id,
      a.name as agency_name,
      a.level as agency_level,
      a.beans_balance,
      a.owner_id,
      COALESCE(a.commission_rate, 3) as current_commission
    FROM agencies a
    WHERE a.is_active = true AND a.is_blocked IS NOT TRUE
  LOOP
    v_agency_total_income := 0;

    FOR v_host_record IN
      SELECT 
        ah.host_id,
        p.display_name,
        p.app_uid,
        COALESCE(p.total_earnings, 0) as total_earnings
      FROM agency_hosts ah
      JOIN profiles p ON p.id = ah.host_id
      WHERE ah.agency_id = v_agency_record.agency_id
        AND ah.status = 'active'
        AND COALESCE(p.total_earnings, 0) > 0
    LOOP
      v_host_earnings := v_host_record.total_earnings;
      
      IF v_host_earnings > 0 THEN
        -- Record the transfer
        INSERT INTO agency_earnings_transfers (
          agency_id, agency_name, host_id, host_name, host_uid,
          amount, commission_rate, gift_earnings, call_earnings,
          period_start, period_end, status, transfer_type, processed_at, notes
        ) VALUES (
          v_agency_record.agency_id, v_agency_record.agency_name,
          v_host_record.host_id, v_host_record.display_name, v_host_record.app_uid,
          v_host_earnings, v_agency_record.current_commission, v_host_earnings, 0,
          v_period_start, v_period_end, 'completed', 'weekly_auto', now(),
          format('Host %s earned %s beans this week', v_host_record.display_name, v_host_earnings)
        );

        -- Transfer host earnings to agency (100% of host beans)
        UPDATE agencies
        SET beans_balance = COALESCE(beans_balance, 0) + v_host_earnings,
            wallet_balance = COALESCE(wallet_balance, 0) + v_host_earnings,
            updated_at = now()
        WHERE id = v_agency_record.agency_id;

        -- Reset host earnings to 0
        UPDATE profiles
        SET total_earnings = 0,
            updated_at = now()
        WHERE id = v_host_record.host_id;

        v_agency_total_income := v_agency_total_income + v_host_earnings;
        v_processed_count := v_processed_count + 1;
        v_total_host_earnings := v_total_host_earnings + v_host_earnings;
      END IF;
    END LOOP;

    -- Record performance (NO extra commission - already given in real-time)
    IF v_agency_total_income > 0 THEN
      INSERT INTO agency_performance (
        agency_id, period_type, period_start, total_income,
        new_hosts_count, total_host_hours, golden_host_income
      ) VALUES (
        v_agency_record.agency_id, 'weekly', v_period_start, v_agency_total_income,
        (SELECT count(*) FROM agency_hosts WHERE agency_id = v_agency_record.agency_id AND status = 'active' AND joined_at >= v_period_start),
        0, 0
      )
      ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;

  v_result := jsonb_build_object(
    'success', true,
    'processed_agencies', v_processed_count,
    'total_host_earnings', v_total_host_earnings,
    'period_start', v_period_start,
    'period_end', v_period_end
  );

  RETURN v_result;
END;
$$;
