
-- Fix: All beans (host earnings + company commission) go to agency beans_balance
-- Host earnings and commission are recorded separately in different tables
-- Agency can withdraw everything together

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

    -- Process each host: transfer their earnings to agency beans_balance
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
        -- Record host earning transfer in agency_earnings_transfers
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

        -- Host earnings go to AGENCY beans_balance (agency pays host separately)
        UPDATE agencies
        SET beans_balance = COALESCE(beans_balance, 0) + v_host_earnings,
            wallet_balance = COALESCE(wallet_balance, 0) + v_host_earnings,
            updated_at = now()
        WHERE id = v_agency_record.agency_id;

        -- Reset host total_earnings to 0
        UPDATE profiles
        SET total_earnings = 0,
            updated_at = now()
        WHERE id = v_host_record.host_id;

        v_agency_total_income := v_agency_total_income + v_host_earnings;
        v_processed_count := v_processed_count + 1;
        v_total_host_earnings := v_total_host_earnings + v_host_earnings;
      END IF;
    END LOOP;

    -- Calculate COMPANY BONUS commission for agency (NOT from host, extra from company)
    IF v_agency_total_income > 0 THEN
      v_agency_commission := FLOOR(v_agency_total_income * v_agency_record.current_commission / 100);
      
      -- Add company commission ALSO to agency beans_balance (same wallet)
      UPDATE agencies
      SET beans_balance = COALESCE(beans_balance, 0) + v_agency_commission,
          wallet_balance = COALESCE(wallet_balance, 0) + v_agency_commission,
          updated_at = now()
      WHERE id = v_agency_record.agency_id;

      -- Record commission in separate history table
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
        format('Level %s (%s%%) commission on %s beans total host earnings = %s beans bonus from company', 
               v_agency_record.agency_level, v_agency_record.current_commission, v_agency_total_income, v_agency_commission)
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
    'total_host_earnings_to_agencies', v_total_host_earnings,
    'total_company_commission_to_agencies', v_total_commission,
    'agencies_reset', true,
    'timestamp', now(),
    'message', format('Processed %s hosts. Host earnings: %s beans → agency wallet. Company commission: %s beans → agency wallet. All in same beans_balance. Agencies reset to A1.', 
                      v_processed_count, v_total_host_earnings, v_total_commission)
  );
  
  RETURN v_result;
END;
$$;
