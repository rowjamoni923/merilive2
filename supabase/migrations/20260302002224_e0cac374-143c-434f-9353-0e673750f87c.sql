
-- Create a dedicated helper function to reset host earnings
-- This runs as SECURITY DEFINER so current_user != session_user, bypassing the trigger
CREATE OR REPLACE FUNCTION public.reset_host_total_earnings(p_host_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE profiles
  SET total_earnings = 0,
      updated_at = now()
  WHERE id = p_host_id;
END;
$$;

-- Now update process_weekly_agency_transfers to use the helper function
CREATE OR REPLACE FUNCTION public.process_weekly_agency_transfers()
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
  v_first_active_host_id uuid;
BEGIN
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

        UPDATE agencies
        SET beans_balance = COALESCE(beans_balance, 0) + v_host_earnings,
            wallet_balance = COALESCE(wallet_balance, 0) + v_host_earnings,
            updated_at = now()
        WHERE id = v_agency_record.agency_id;

        -- Use dedicated function to bypass the trigger safely
        PERFORM reset_host_total_earnings(v_host_record.host_id);

        v_agency_total_income := v_agency_total_income + v_host_earnings;
        v_processed_count := v_processed_count + 1;
        v_total_host_earnings := v_total_host_earnings + v_host_earnings;
      END IF;
    END LOOP;

    -- Calculate COMPANY BONUS commission for agency
    IF v_agency_total_income > 0 THEN
      v_agency_commission := FLOOR(v_agency_total_income * v_agency_record.current_commission / 100);
      
      UPDATE agencies
      SET beans_balance = COALESCE(beans_balance, 0) + v_agency_commission,
          wallet_balance = COALESCE(wallet_balance, 0) + v_agency_commission,
          updated_at = now()
      WHERE id = v_agency_record.agency_id;

      SELECT ah.host_id INTO v_first_active_host_id
      FROM agency_hosts ah
      JOIN profiles p ON p.id = ah.host_id
      WHERE ah.agency_id = v_agency_record.agency_id AND ah.status = 'active'
      LIMIT 1;

      IF v_first_active_host_id IS NOT NULL THEN
        INSERT INTO agency_commission_history (
          agency_id, host_id, transaction_type, original_amount, 
          commission_rate, commission_amount, notes
        ) VALUES (
          v_agency_record.agency_id, 
          v_first_active_host_id,
          'weekly_company_bonus',
          v_agency_total_income,
          v_agency_record.current_commission,
          v_agency_commission,
          format('Level %s (%s%%) commission on %s beans total host earnings = %s beans bonus from company', 
                 v_agency_record.agency_level, v_agency_record.current_commission, v_agency_total_income, v_agency_commission)
        );
      END IF;

      v_total_commission := v_total_commission + v_agency_commission;
    END IF;

    -- Record performance
    INSERT INTO agency_performance (
      agency_id, period_type, period_start, total_income,
      new_hosts_count, total_host_hours, golden_host_income
    ) VALUES (
      v_agency_record.agency_id, 'weekly', v_period_start, v_agency_total_income,
      (SELECT count(*) FROM agency_hosts WHERE agency_id = v_agency_record.agency_id AND status = 'active' AND joined_at >= v_period_start),
      0, 0
    )
    ON CONFLICT DO NOTHING;
  END LOOP;

  v_result := jsonb_build_object(
    'success', true,
    'processed_agencies', v_processed_count,
    'total_host_earnings', v_total_host_earnings,
    'total_commission', v_total_commission,
    'period_start', v_period_start,
    'period_end', v_period_end
  );

  RETURN v_result;
END;
$$;
