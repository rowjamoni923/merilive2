
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
  v_period_start timestamp with time zone;
  v_period_end timestamp with time zone;
  v_correct_commission_rate numeric;
  v_host_gift_earnings numeric;
  v_host_call_earnings numeric;
  v_host_total numeric;
  v_commission_amount numeric;
  v_net_amount numeric;
  v_transfer_count integer := 0;
BEGIN
  v_period_end := now();
  v_period_start := now() - interval '7 days';

  FOR v_agency_record IN
    SELECT a.id as agency_id, a.name as agency_name, a.level as agency_level, a.commission_rate as current_rate
    FROM agencies a
    WHERE a.is_active = true AND a.is_blocked IS NOT TRUE
  LOOP
    -- Get correct commission rate from tier
    SELECT COALESCE(alt.commission_rate, 3)
    INTO v_correct_commission_rate
    FROM agency_level_tiers alt
    WHERE alt.level_code = COALESCE(v_agency_record.agency_level, 'A1')
      AND alt.is_active = true
    LIMIT 1;

    -- Update commission rate if different
    UPDATE agencies
    SET commission_rate = COALESCE(v_correct_commission_rate, 3),
        updated_at = now()
    WHERE id = v_agency_record.agency_id
      AND commission_rate IS DISTINCT FROM COALESCE(v_correct_commission_rate, 3);

    -- Process each host in the agency
    FOR v_host_record IN
      SELECT ah.host_id, p.display_name as host_name, p.uid as host_uid
      FROM agency_hosts ah
      JOIN profiles p ON p.id = ah.host_id
      WHERE ah.agency_id = v_agency_record.agency_id
        AND ah.status = 'active'
    LOOP
      -- Calculate gift earnings for this host in this period
      SELECT COALESCE(SUM(original_amount), 0)
      INTO v_host_gift_earnings
      FROM agency_commission_history
      WHERE agency_id = v_agency_record.agency_id
        AND host_id = v_host_record.host_id
        AND transaction_type = 'gift'
        AND created_at >= v_period_start
        AND created_at < v_period_end;

      -- Calculate call earnings
      SELECT COALESCE(SUM(original_amount), 0)
      INTO v_host_call_earnings
      FROM agency_commission_history
      WHERE agency_id = v_agency_record.agency_id
        AND host_id = v_host_record.host_id
        AND transaction_type = 'call'
        AND created_at >= v_period_start
        AND created_at < v_period_end;

      v_host_total := v_host_gift_earnings + v_host_call_earnings;

      -- Only create transfer if there are earnings
      IF v_host_total > 0 THEN
        v_commission_amount := ROUND(v_host_total * COALESCE(v_correct_commission_rate, 3) / 100, 2);
        v_net_amount := v_host_total - v_commission_amount;

        -- Create transfer record
        INSERT INTO agency_earnings_transfers (
          agency_id, host_id, amount, commission_rate,
          gift_earnings, call_earnings, 
          agency_name, host_name, host_uid,
          period_start, period_end, 
          status, transfer_type, processed_at
        ) VALUES (
          v_agency_record.agency_id, v_host_record.host_id, v_net_amount, v_correct_commission_rate,
          v_host_gift_earnings, v_host_call_earnings,
          v_agency_record.agency_name, v_host_record.host_name, v_host_record.host_uid,
          v_period_start, v_period_end,
          'completed', 'weekly_auto', now()
        );

        -- Add commission to agency diamond balance
        UPDATE agencies
        SET diamond_balance = diamond_balance + v_commission_amount,
            updated_at = now()
        WHERE id = v_agency_record.agency_id;

        v_total_host_earnings := v_total_host_earnings + v_net_amount;
        v_total_commission := v_total_commission + v_commission_amount;
        v_transfer_count := v_transfer_count + 1;
      END IF;
    END LOOP;

    v_processed_count := v_processed_count + 1;
  END LOOP;

  v_result := jsonb_build_object(
    'success', true,
    'processed_agencies', v_processed_count,
    'total_transfers', v_transfer_count,
    'total_host_earnings', v_total_host_earnings,
    'total_commission', v_total_commission,
    'period_start', v_period_start,
    'period_end', v_period_end
  );

  RETURN v_result;
END;
$$;
