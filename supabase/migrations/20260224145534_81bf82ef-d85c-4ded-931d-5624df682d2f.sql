
-- Fix: Agency gets ONLY their commission %, host keeps the rest
CREATE OR REPLACE FUNCTION process_weekly_agency_transfers()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
  v_processed_count integer := 0;
  v_total_commission numeric := 0;
  v_agency_record RECORD;
  v_host_record RECORD;
  v_host_earnings numeric;
  v_commission_amount numeric;
  v_host_net numeric;
  v_period_start timestamp with time zone;
  v_period_end timestamp with time zone;
  v_agency_total_income numeric;
BEGIN
  v_period_end := now();
  v_period_start := now() - interval '7 days';

  FOR v_agency_record IN 
    SELECT 
      a.id as agency_id,
      a.name as agency_name,
      a.level as agency_level,
      a.beans_balance,
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
        -- Calculate commission for agency (e.g. 5% of total)
        v_commission_amount := FLOOR(v_host_earnings * v_agency_record.current_commission / 100);
        -- Host keeps the rest
        v_host_net := v_host_earnings - v_commission_amount;

        -- Record transfer
        INSERT INTO agency_earnings_transfers (
          agency_id, agency_name, host_id, host_name, host_uid,
          amount, commission_rate, gift_earnings, call_earnings,
          period_start, period_end, status, transfer_type, processed_at, notes
        ) VALUES (
          v_agency_record.agency_id, v_agency_record.agency_name,
          v_host_record.host_id, v_host_record.display_name, v_host_record.app_uid,
          v_commission_amount, v_agency_record.current_commission, v_host_earnings, 0,
          v_period_start, v_period_end, 'completed', 'weekly_auto', now(),
          format('Commission %s%% of %s beans = %s beans. Host net: %s beans', 
                 v_agency_record.current_commission, v_host_earnings, v_commission_amount, v_host_net)
        );

        -- Add ONLY commission to agency balance
        UPDATE agencies
        SET beans_balance = COALESCE(beans_balance, 0) + v_commission_amount,
            wallet_balance = COALESCE(wallet_balance, 0) + v_commission_amount,
            updated_at = now()
        WHERE id = v_agency_record.agency_id;

        -- Move host net earnings to pending_earnings (for withdrawal)
        -- Reset total_earnings for new week
        UPDATE profiles
        SET pending_earnings = COALESCE(pending_earnings, 0) + v_host_net,
            total_earnings = 0,
            updated_at = now()
        WHERE id = v_host_record.host_id;

        v_agency_total_income := v_agency_total_income + v_host_earnings;
        v_processed_count := v_processed_count + 1;
        v_total_commission := v_total_commission + v_commission_amount;
      END IF;
    END LOOP;

    -- Record agency performance
    INSERT INTO agency_performance (agency_id, period_type, period_start, total_income, updated_at)
    VALUES (v_agency_record.agency_id, 'weekly', v_period_start, v_agency_total_income, now())
    ON CONFLICT DO NOTHING;

    -- RESET agency level to A1 and commission to 3% for new week
    UPDATE agencies
    SET level = 'A1',
        commission_rate = 3,
        updated_at = now()
    WHERE id = v_agency_record.agency_id;

  END LOOP;

  v_result := jsonb_build_object(
    'processed_count', v_processed_count,
    'total_commission', v_total_commission,
    'agencies_reset', true,
    'timestamp', now(),
    'message', format('Processed %s hosts. Total commission: %s beans. All agencies reset to A1 (3%%)', 
                      v_processed_count, v_total_commission)
  );
  
  RETURN v_result;
END;
$$;
