
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
  v_total_sub_agency_bonus numeric := 0;
  v_agency_record RECORD;
  v_host_record RECORD;
  v_host_earnings numeric;
  v_period_start timestamp with time zone;
  v_period_end timestamp with time zone;
  v_agency_total_income numeric;
  v_agency_commission numeric;
  -- Sub-agency bonus variables
  v_sub_agency_record RECORD;
  v_sub_agent_commission_rate numeric;
  v_parent_bonus numeric;
  v_sub_agency_settings jsonb;
BEGIN
  v_period_end := now();
  v_period_start := now() - interval '7 days';

  -- Get sub-agency commission rate from app_settings
  SELECT setting_value::jsonb INTO v_sub_agency_settings
  FROM app_settings
  WHERE setting_key = 'agency_commission_settings';

  v_sub_agent_commission_rate := COALESCE((v_sub_agency_settings->>'sub_agent_commission_rate')::numeric, 2);

  FOR v_agency_record IN 
    SELECT 
      a.id as agency_id,
      a.name as agency_name,
      a.level as agency_level,
      a.beans_balance,
      a.parent_agency_id,
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
        -- Record host earning transfer
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

        -- Host earnings go to AGENCY beans_balance
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

    -- Calculate COMPANY BONUS commission for agency
    IF v_agency_total_income > 0 THEN
      v_agency_commission := FLOOR(v_agency_total_income * v_agency_record.current_commission / 100);
      
      -- Add company commission to agency beans_balance
      UPDATE agencies
      SET beans_balance = COALESCE(beans_balance, 0) + v_agency_commission,
          wallet_balance = COALESCE(wallet_balance, 0) + v_agency_commission,
          updated_at = now()
      WHERE id = v_agency_record.agency_id;

      -- Record commission in history
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

      -- =====================================================
      -- SUB-AGENCY BONUS: Give parent agency bonus commission
      -- =====================================================
      IF v_agency_record.parent_agency_id IS NOT NULL THEN
        v_parent_bonus := FLOOR(v_agency_total_income * v_sub_agent_commission_rate / 100);
        
        IF v_parent_bonus > 0 THEN
          -- Add sub-agency bonus to parent agency beans_balance
          UPDATE agencies
          SET beans_balance = COALESCE(beans_balance, 0) + v_parent_bonus,
              wallet_balance = COALESCE(wallet_balance, 0) + v_parent_bonus,
              updated_at = now()
          WHERE id = v_agency_record.parent_agency_id;

          -- Record sub-agency bonus commission in parent's history
          INSERT INTO agency_commission_history (
            agency_id, host_id, transaction_type, original_amount, 
            commission_rate, commission_amount, notes
          ) VALUES (
            v_agency_record.parent_agency_id,
            (SELECT host_id FROM agency_hosts WHERE agency_id = v_agency_record.agency_id AND status = 'active' LIMIT 1),
            'sub_agency_bonus',
            v_agency_total_income,
            v_sub_agent_commission_rate,
            v_parent_bonus,
            format('Sub-agency "%s" earned %s beans. Parent gets %s%% bonus = %s beans', 
                   v_agency_record.agency_name, v_agency_total_income, v_sub_agent_commission_rate, v_parent_bonus)
          );

          v_total_sub_agency_bonus := v_total_sub_agency_bonus + v_parent_bonus;
        END IF;
      END IF;
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
    'total_sub_agency_bonus_to_parents', v_total_sub_agency_bonus,
    'sub_agent_commission_rate', v_sub_agent_commission_rate,
    'agencies_reset', true,
    'timestamp', now(),
    'message', format('Processed %s hosts. Host earnings: %s beans. Company commission: %s beans. Sub-agency bonus to parents: %s beans (%s%%). All agencies reset to A1.', 
                      v_processed_count, v_total_host_earnings, v_total_commission, v_total_sub_agency_bonus, v_sub_agent_commission_rate)
  );
  
  RETURN v_result;
END;
$$;
