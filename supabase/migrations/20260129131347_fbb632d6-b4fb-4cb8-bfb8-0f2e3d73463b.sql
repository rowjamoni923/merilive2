
-- Update the transfer function to send 100% of host earnings to agency
-- Host should have 0 beans after transfer - agency pays them separately
CREATE OR REPLACE FUNCTION public.process_weekly_agency_transfers()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
  -- Set the period (last 7 days)
  v_period_end := now();
  v_period_start := now() - interval '7 days';

  -- Loop through all active agencies
  FOR v_agency_record IN 
    SELECT 
      a.id as agency_id,
      a.name as agency_name,
      a.beans_balance,
      COALESCE(alt.commission_rate, 3) as commission_rate
    FROM agencies a
    LEFT JOIN agency_level_tiers alt ON alt.level_code = a.level
    WHERE a.is_active = true
  LOOP
    v_commission_rate := COALESCE(v_agency_record.commission_rate, 3);

    -- Loop through all active hosts in this agency with ANY earnings
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
      -- Get total host earnings
      v_host_earnings := v_host_record.total_earnings;
      
      -- Only process if there are earnings
      IF v_host_earnings > 0 THEN
        -- Insert transfer record - 100% goes to agency
        INSERT INTO agency_earnings_transfers (
          agency_id,
          agency_name,
          host_id,
          host_name,
          amount,
          commission_rate,
          gift_earnings,
          call_earnings,
          period_start,
          period_end,
          status,
          transfer_type,
          processed_at,
          notes
        ) VALUES (
          v_agency_record.agency_id,
          v_agency_record.agency_name,
          v_host_record.host_id,
          v_host_record.display_name,
          v_host_earnings, -- 100% of earnings go to agency
          100, -- 100% transfer rate
          v_host_earnings,
          0,
          v_period_start,
          v_period_end,
          'completed',
          'weekly_auto',
          now(),
          format('Full transfer: %s beans from host to agency (100%%)', v_host_earnings)
        );

        -- Update BOTH agency balance columns with 100% of host earnings
        UPDATE agencies
        SET beans_balance = COALESCE(beans_balance, 0) + v_host_earnings,
            wallet_balance = COALESCE(wallet_balance, 0) + v_host_earnings,
            updated_at = now()
        WHERE id = v_agency_record.agency_id;

        -- CRITICAL: Reset host's total_earnings AND pending_earnings to ZERO
        -- All beans go to agency - host gets paid separately by agency
        UPDATE profiles
        SET 
          total_earnings = 0,
          pending_earnings = 0, -- Host gets nothing - agency pays them externally
          updated_at = now()
        WHERE id = v_host_record.host_id;

        -- Update counters
        v_processed_count := v_processed_count + 1;
        v_total_amount := v_total_amount + v_host_earnings;
      END IF;
    END LOOP;
  END LOOP;

  -- Return detailed result
  v_result := jsonb_build_object(
    'processed_count', v_processed_count,
    'total_amount', v_total_amount,
    'timestamp', now(),
    'message', format('Transferred 100%% earnings from %s hosts. Total: %s beans to agencies', 
                      v_processed_count, v_total_amount)
  );
  
  RETURN v_result;
END;
$function$;

-- Also reset the Hot baby account's pending_earnings to 0 since it was incorrectly accumulated
UPDATE profiles
SET pending_earnings = 0
WHERE id = 'c02c5d52-1d10-4259-a31d-0eae1c31f49c';
