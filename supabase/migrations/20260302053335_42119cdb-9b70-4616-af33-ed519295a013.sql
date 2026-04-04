
-- Fix 1: Update process_weekly_agency_transfers to dynamically look up commission rate from agency_level_tiers
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
  v_total_commission numeric := 0;
  v_agency_record RECORD;
  v_host_record RECORD;
  v_host_earnings numeric;
  v_period_start timestamp with time zone;
  v_period_end timestamp with time zone;
  v_agency_total_income numeric;
  v_agency_commission numeric;
  v_first_active_host_id uuid;
  v_correct_commission_rate numeric;
BEGIN
  PERFORM set_config('app.bypass_profile_protection', 'true', true);

  v_period_end := now();
  v_period_start := now() - interval '7 days';

  FOR v_agency_record IN 
    SELECT 
      a.id as agency_id,
      a.name as agency_name,
      a.level as agency_level,
      a.beans_balance,
      a.owner_id
    FROM agencies a
    WHERE a.is_active = true AND a.is_blocked IS NOT TRUE
  LOOP
    v_agency_total_income := 0;

    -- DYNAMIC lookup: Get commission rate from agency_level_tiers (NOT from agencies.commission_rate)
    SELECT COALESCE(alt.commission_rate, 3) INTO v_correct_commission_rate
    FROM agency_level_tiers alt
    WHERE alt.level_code = COALESCE(v_agency_record.agency_level, 'A1')
      AND alt.is_active = true;
    
    IF v_correct_commission_rate IS NULL THEN
      v_correct_commission_rate := 3;
    END IF;

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
          v_host_earnings, v_correct_commission_rate, v_host_earnings, 0,
          v_period_start, v_period_end, 'completed', 'weekly_auto', now(),
          format('Host %s earned %s beans this week', v_host_record.display_name, v_host_earnings)
        );

        UPDATE agencies
        SET beans_balance = COALESCE(beans_balance, 0) + v_host_earnings,
            wallet_balance = COALESCE(wallet_balance, 0) + v_host_earnings,
            updated_at = now()
        WHERE id = v_agency_record.agency_id;

        UPDATE profiles
        SET total_earnings = 0,
            updated_at = now()
        WHERE id = v_host_record.host_id;

        v_agency_total_income := v_agency_total_income + v_host_earnings;
        v_processed_count := v_processed_count + 1;
        v_total_host_earnings := v_total_host_earnings + v_host_earnings;
      END IF;
    END LOOP;

    IF v_agency_total_income > 0 THEN
      v_agency_commission := FLOOR(v_agency_total_income * v_correct_commission_rate / 100);
      
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
          v_correct_commission_rate,
          v_agency_commission,
          format('Level %s (%s%%) commission on %s beans total host earnings = %s beans bonus from company', 
                 v_agency_record.agency_level, v_correct_commission_rate, v_agency_total_income, v_agency_commission)
        );
      END IF;

      v_total_commission := v_total_commission + v_agency_commission;
    END IF;

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

  PERFORM set_config('app.bypass_profile_protection', 'false', true);

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

-- Fix 2: Correct agencies that were wrongly upgraded to A5 by the dashboard L5 helper override
-- Reset agencies where the owner is NOT earning enough to justify A5 but got A5 from helper status
-- Only reset if the agency's actual level should be different based on income tiers
UPDATE agencies a
SET level = 'A1',
    commission_rate = 3
WHERE a.level = 'A5'
  AND a.is_active = true
  AND EXISTS (
    SELECT 1 FROM topup_helpers th
    WHERE th.user_id = a.owner_id
      AND th.trader_level = 5
  )
  -- Only reset if the agency hasn't actually earned enough for A5 (over $5001/week in beans)
  -- Check: if no recent weekly performance shows income > 5001 * beans_rate, reset to A1
  AND NOT EXISTS (
    SELECT 1 FROM agency_performance ap
    WHERE ap.agency_id = a.id
      AND ap.period_type = 'weekly'
      AND ap.period_start > now() - interval '14 days'
      AND ap.total_income > 45000000 -- ~$5001 * 9000 beans/dollar
  );

-- Fix 3: Sync commission_rate in agencies table to match their level tier
UPDATE agencies a
SET commission_rate = alt.commission_rate
FROM agency_level_tiers alt
WHERE alt.level_code = a.level
  AND alt.is_active = true
  AND a.commission_rate != alt.commission_rate;
