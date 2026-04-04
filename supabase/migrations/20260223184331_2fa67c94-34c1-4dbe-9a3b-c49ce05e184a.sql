
-- 1. Fix auto_credit_agency_commission to use agency_level_tiers for correct rate
CREATE OR REPLACE FUNCTION auto_credit_agency_commission()
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
  
  -- Get agency level and look up commission rate from agency_level_tiers (source of truth)
  SELECT a.level INTO _agency_level
  FROM agencies a
  WHERE a.id = _host_agency_id;
  
  SELECT COALESCE(alt.commission_rate, 3) INTO _agency_commission_rate
  FROM agency_level_tiers alt
  WHERE alt.level_code = COALESCE(_agency_level, 'A1')
    AND alt.is_active = true;
  
  IF _agency_commission_rate IS NULL THEN
    _agency_commission_rate := 3; -- fallback
  END IF;
  
  -- Calculate host earnings (40% of coin value)  
  _host_earnings := FLOOR(NEW.coin_amount * 40 / 100);
  
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
      'Auto commission from gift: ' || NEW.coin_amount || ' coins @ ' || _agency_commission_rate || '%'
    );
  END IF;
  
  RETURN NEW;
END;
$$;

-- 2. Fix auto_credit_agency_commission_from_call to also use agency_level_tiers
CREATE OR REPLACE FUNCTION auto_credit_agency_commission_from_call()
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
  _host_commission_rate NUMERIC;
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
  
  SELECT COALESCE((setting_value->>'host_commission_percent')::NUMERIC, 50)
  INTO _host_commission_rate
  FROM app_settings
  WHERE setting_key = 'call_rates';
  
  IF _host_commission_rate IS NULL THEN
    _host_commission_rate := 50;
  END IF;
  
  _host_earnings := FLOOR(COALESCE(NEW.coins_spent, 0) * _host_commission_rate / 100);
  
  -- Get commission rate from agency_level_tiers (source of truth)
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
  
  _commission_amount := FLOOR(_host_earnings * _agency_commission_rate / 100);
  
  IF _commission_amount > 0 THEN
    UPDATE agencies
    SET beans_balance = COALESCE(beans_balance, 0) + _commission_amount
    WHERE id = _host_agency_id;
    
    INSERT INTO agency_commission_history (
      agency_id, host_id, transaction_type, original_amount,
      commission_rate, commission_amount, source_transaction_id, notes
    ) VALUES (
      _host_agency_id, NEW.host_id, 'call', _host_earnings,
      _agency_commission_rate, _commission_amount, NEW.id,
      'Auto commission from call: ' || COALESCE(NEW.coins_spent, 0) || ' coins @ ' || _agency_commission_rate || '%'
    );
  END IF;
  
  RETURN NEW;
END;
$$;

-- 3. Fix process_weekly_agency_transfers to use agency_level_tiers
CREATE OR REPLACE FUNCTION process_weekly_agency_transfers()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
  v_processed_count integer := 0;
  v_total_amount numeric := 0;
  v_agency_record RECORD;
  v_host_record RECORD;
  v_commission_rate numeric;
  v_host_earnings numeric;
  v_period_start timestamp with time zone;
  v_period_end timestamp with time zone;
BEGIN
  v_period_end := now();
  v_period_start := now() - interval '7 days';

  FOR v_agency_record IN 
    SELECT 
      a.id as agency_id,
      a.name as agency_name,
      a.level as agency_level,
      a.beans_balance,
      COALESCE(alt.commission_rate, 3) as commission_rate
    FROM agencies a
    LEFT JOIN agency_level_tiers alt ON alt.level_code = a.level AND alt.is_active = true
    WHERE a.is_active = true
  LOOP
    v_commission_rate := COALESCE(v_agency_record.commission_rate, 3);

    FOR v_host_record IN
      SELECT 
        ah.host_id,
        p.display_name,
        COALESCE(p.total_earnings, 0) as total_earnings
      FROM agency_hosts ah
      JOIN profiles p ON p.id = ah.host_id
      WHERE ah.agency_id = v_agency_record.agency_id
        AND ah.status = 'active'
        AND COALESCE(p.total_earnings, 0) > 0
    LOOP
      v_host_earnings := v_host_record.total_earnings;
      
      IF v_host_earnings > 0 THEN
        INSERT INTO agency_earnings_transfers (
          agency_id, agency_name, host_id, host_name,
          amount, commission_rate, gift_earnings, call_earnings,
          period_start, period_end, status, transfer_type, processed_at, notes
        ) VALUES (
          v_agency_record.agency_id, v_agency_record.agency_name,
          v_host_record.host_id, v_host_record.display_name,
          v_host_earnings, 100, v_host_earnings, 0,
          v_period_start, v_period_end, 'completed', 'weekly_auto', now(),
          format('Full transfer: %s beans from host to agency (100%%)', v_host_earnings)
        );

        UPDATE agencies
        SET beans_balance = COALESCE(beans_balance, 0) + v_host_earnings,
            wallet_balance = COALESCE(wallet_balance, 0) + v_host_earnings,
            updated_at = now()
        WHERE id = v_agency_record.agency_id;

        UPDATE profiles
        SET total_earnings = 0, pending_earnings = 0, updated_at = now()
        WHERE id = v_host_record.host_id;

        v_processed_count := v_processed_count + 1;
        v_total_amount := v_total_amount + v_host_earnings;
      END IF;
    END LOOP;
  END LOOP;

  v_result := jsonb_build_object(
    'processed_count', v_processed_count,
    'total_amount', v_total_amount,
    'timestamp', now(),
    'message', format('Transferred 100%% earnings from %s hosts. Total: %s beans to agencies', 
                      v_processed_count, v_total_amount)
  );
  
  RETURN v_result;
END;
$$;

-- 4. Create function to sync Payroll Helper agencies to A5 level
CREATE OR REPLACE FUNCTION sync_payroll_helper_agency_level()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _a5_commission NUMERIC;
BEGIN
  -- When a helper becomes Level 5 Payroll, upgrade their agency to A5
  IF NEW.trader_level = 5 AND NEW.payroll_enabled = true AND NEW.is_verified = true THEN
    -- Get A5 commission rate
    SELECT commission_rate INTO _a5_commission
    FROM agency_level_tiers
    WHERE level_code = 'A5' AND is_active = true;
    
    IF _a5_commission IS NULL THEN
      _a5_commission := 12;
    END IF;
    
    UPDATE agencies
    SET level = 'A5',
        commission_rate = _a5_commission,
        updated_at = now()
    WHERE owner_id = NEW.user_id;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Drop existing trigger if any
DROP TRIGGER IF EXISTS trg_sync_payroll_helper_agency ON topup_helpers;

-- Create trigger
CREATE TRIGGER trg_sync_payroll_helper_agency
  AFTER INSERT OR UPDATE OF trader_level, payroll_enabled, is_verified
  ON topup_helpers
  FOR EACH ROW
  EXECUTE FUNCTION sync_payroll_helper_agency_level();

-- 5. Immediately fix all existing Payroll Helper agencies to A5/12%
UPDATE agencies a
SET level = 'A5',
    commission_rate = 12,
    updated_at = now()
FROM topup_helpers th
WHERE th.user_id = a.owner_id
  AND th.trader_level = 5
  AND th.payroll_enabled = true
  AND th.is_verified = true
  AND (a.level != 'A5' OR a.commission_rate != 12);

-- 6. Sync all non-payroll agencies' commission_rate from agency_level_tiers
UPDATE agencies a
SET commission_rate = alt.commission_rate,
    updated_at = now()
FROM agency_level_tiers alt
WHERE alt.level_code = a.level
  AND alt.is_active = true
  AND a.commission_rate != alt.commission_rate
  AND NOT EXISTS (
    SELECT 1 FROM topup_helpers th 
    WHERE th.user_id = a.owner_id 
      AND th.trader_level = 5 
      AND th.payroll_enabled = true
  );
