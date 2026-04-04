
-- Fix: Host gets 100% earnings. Agency commission is EXTRA from company, NOT deducted from host.
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
  v_total_host_earnings numeric := 0;
  v_agency_record RECORD;
  v_host_record RECORD;
  v_host_earnings numeric;
  v_period_start timestamp with time zone;
  v_period_end timestamp with time zone;
  v_agency_total_income numeric;
  v_agency_commission numeric;
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

    -- First pass: collect all host earnings and transfer 100% to host pending
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
        -- Record the transfer - HOST GETS 100%
        INSERT INTO agency_earnings_transfers (
          agency_id, agency_name, host_id, host_name, host_uid,
          amount, commission_rate, gift_earnings, call_earnings,
          period_start, period_end, status, transfer_type, processed_at, notes
        ) VALUES (
          v_agency_record.agency_id, v_agency_record.agency_name,
          v_host_record.host_id, v_host_record.display_name, v_host_record.app_uid,
          v_host_earnings, v_agency_record.current_commission, v_host_earnings, 0,
          v_period_start, v_period_end, 'completed', 'weekly_auto', now(),
          format('Host earned %s beans (100%% kept). Agency commission calculated separately.', v_host_earnings)
        );

        -- HOST GETS 100% - move all earnings to pending_earnings
        UPDATE profiles
        SET pending_earnings = COALESCE(pending_earnings, 0) + v_host_earnings,
            total_earnings = 0,
            updated_at = now()
        WHERE id = v_host_record.host_id;

        v_agency_total_income := v_agency_total_income + v_host_earnings;
        v_processed_count := v_processed_count + 1;
        v_total_host_earnings := v_total_host_earnings + v_host_earnings;
      END IF;
    END LOOP;

    -- Now calculate COMPANY BONUS commission for agency based on total weekly income
    -- This is NOT deducted from hosts - it's extra from the company
    IF v_agency_total_income > 0 THEN
      v_agency_commission := FLOOR(v_agency_total_income * v_agency_record.current_commission / 100);
      
      -- Add company commission bonus to agency balance
      UPDATE agencies
      SET beans_balance = COALESCE(beans_balance, 0) + v_agency_commission,
          wallet_balance = COALESCE(wallet_balance, 0) + v_agency_commission,
          updated_at = now()
      WHERE id = v_agency_record.agency_id;

      -- Record commission separately in commission history
      INSERT INTO agency_commission_history (
        agency_id, host_id, transaction_type, original_amount, 
        commission_rate, commission_amount, notes
      ) VALUES (
        v_agency_record.agency_id, 
        (SELECT host_id FROM agency_hosts WHERE agency_id = v_agency_record.agency_id AND status = 'active' LIMIT 1),
        'weekly_company_bonus',
        v_agency_total_income,
        v_agency_record.current_commission,
        v_agency_commission,
        format('Company bonus: %s%% of %s beans total host earnings = %s beans commission (NOT deducted from hosts)', 
               v_agency_record.current_commission, v_agency_total_income, v_agency_commission)
      );

      v_total_commission := v_total_commission + v_agency_commission;
    END IF;

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
    'total_host_earnings', v_total_host_earnings,
    'total_company_commission', v_total_commission,
    'agencies_reset', true,
    'timestamp', now(),
    'message', format('Processed %s hosts. Total host earnings: %s beans (100%% to hosts). Company commission to agencies: %s beans. All agencies reset to A1 (3%%)', 
                      v_processed_count, v_total_host_earnings, v_total_commission)
  );
  
  RETURN v_result;
END;
$$;
