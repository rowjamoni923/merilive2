
-- Sync wallet_balance with beans_balance for all agencies
-- This ensures both columns show the same value
UPDATE agencies 
SET wallet_balance = COALESCE(beans_balance, 0)
WHERE wallet_balance IS DISTINCT FROM COALESCE(beans_balance, 0);

-- Also update the transfer function to update both columns
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
  v_commission_amount numeric;
  v_host_earnings numeric;
  v_host_share numeric;
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
      -- Calculate total host earnings
      v_host_earnings := v_host_record.total_earnings;
      
      -- Only process if there are earnings
      IF v_host_earnings > 0 THEN
        -- Calculate commission for agency
        v_commission_amount := FLOOR(v_host_earnings * (v_commission_rate / 100));
        
        -- Calculate host's share (remaining after commission)
        v_host_share := v_host_earnings - v_commission_amount;

        -- Insert transfer record with full breakdown
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
          v_commission_amount,
          v_commission_rate,
          v_host_earnings, -- Total earnings before split
          0,
          v_period_start,
          v_period_end,
          'completed',
          'weekly_auto',
          now(),
          format('Full transfer: %s beans total, %s%% commission (%s) to agency, %s to host pending', 
                 v_host_earnings, v_commission_rate, v_commission_amount, v_host_share)
        );

        -- Update BOTH agency balance columns (beans_balance and wallet_balance)
        UPDATE agencies
        SET beans_balance = COALESCE(beans_balance, 0) + v_commission_amount,
            wallet_balance = COALESCE(wallet_balance, 0) + v_commission_amount,
            updated_at = now()
        WHERE id = v_agency_record.agency_id;

        -- CRITICAL: Reset host's total_earnings to ZERO and move host share to pending
        UPDATE profiles
        SET 
          pending_earnings = COALESCE(pending_earnings, 0) + v_host_share,
          total_earnings = 0, -- Complete reset - no beans left
          updated_at = now()
        WHERE id = v_host_record.host_id;

        -- Update counters
        v_processed_count := v_processed_count + 1;
        v_total_amount := v_total_amount + v_commission_amount;
      END IF;
    END LOOP;
  END LOOP;

  -- Return detailed result
  v_result := jsonb_build_object(
    'processed_count', v_processed_count,
    'total_amount', v_total_amount,
    'timestamp', now(),
    'message', format('Transferred earnings from %s hosts. Total agency commission: %s beans', 
                      v_processed_count, v_total_amount)
  );
  
  RETURN v_result;
END;
$function$;
