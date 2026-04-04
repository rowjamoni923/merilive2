
-- Fix: process_weekly_agency_transfers should:
-- 1. Transfer host earnings to agency
-- 2. Record agency commission separately  
-- 3. Reset agency level to A1 (3%) for the new week
-- 4. Reset host total_earnings to 0

CREATE OR REPLACE FUNCTION public.process_weekly_agency_transfers()
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
  v_host_earnings numeric;
  v_period_start timestamp with time zone;
  v_period_end timestamp with time zone;
  v_agency_total_income numeric;
  v_new_level text;
  v_new_commission numeric;
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

    -- Process each host's earnings
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
        -- Transfer full earnings to agency beans_balance
        INSERT INTO agency_earnings_transfers (
          agency_id, agency_name, host_id, host_name, host_uid,
          amount, commission_rate, gift_earnings, call_earnings,
          period_start, period_end, status, transfer_type, processed_at, notes
        ) VALUES (
          v_agency_record.agency_id, v_agency_record.agency_name,
          v_host_record.host_id, v_host_record.display_name, v_host_record.app_uid,
          v_host_earnings, 100, v_host_earnings, 0,
          v_period_start, v_period_end, 'completed', 'weekly_auto', now(),
          format('Weekly transfer: %s beans from %s', v_host_earnings, v_host_record.display_name)
        );

        -- Add to agency balance
        UPDATE agencies
        SET beans_balance = COALESCE(beans_balance, 0) + v_host_earnings,
            wallet_balance = COALESCE(wallet_balance, 0) + v_host_earnings,
            updated_at = now()
        WHERE id = v_agency_record.agency_id;

        -- Reset host earnings to 0
        UPDATE profiles
        SET total_earnings = 0, pending_earnings = 0, updated_at = now()
        WHERE id = v_host_record.host_id;

        v_agency_total_income := v_agency_total_income + v_host_earnings;
        v_processed_count := v_processed_count + 1;
        v_total_amount := v_total_amount + v_host_earnings;
      END IF;
    END LOOP;

    -- Record agency performance for this week
    INSERT INTO agency_performance (agency_id, period_type, period_start, total_income, updated_at)
    VALUES (v_agency_record.agency_id, 'weekly', v_period_start, v_agency_total_income, now())
    ON CONFLICT DO NOTHING;

    -- RESET agency level to A1 and commission to 3% for the new week
    UPDATE agencies
    SET level = 'A1',
        commission_rate = 3,
        updated_at = now()
    WHERE id = v_agency_record.agency_id;

  END LOOP;

  v_result := jsonb_build_object(
    'processed_count', v_processed_count,
    'total_amount', v_total_amount,
    'agencies_reset', true,
    'timestamp', now(),
    'message', format('Transferred earnings from %s hosts. Total: %s beans. All agency levels reset to A1 (3%%)', 
                      v_processed_count, v_total_amount)
  );
  
  RETURN v_result;
END;
$$;

-- Create function to dynamically update agency level based on current week's earnings
-- This runs automatically when host earnings are updated (via gift/call income)
CREATE OR REPLACE FUNCTION public.update_agency_level_on_earnings()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_agency_id uuid;
  v_weekly_income numeric;
  v_new_level text;
  v_new_commission numeric;
  v_week_start timestamp;
BEGIN
  -- Only process if total_earnings changed
  IF NEW.total_earnings IS NOT DISTINCT FROM OLD.total_earnings THEN
    RETURN NEW;
  END IF;

  -- Check if this user is in an agency
  SELECT ah.agency_id INTO v_agency_id
  FROM agency_hosts ah
  WHERE ah.host_id = NEW.id AND ah.status = 'active'
  LIMIT 1;

  IF v_agency_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Calculate total weekly income for this agency (sum of all active hosts' current earnings)
  SELECT COALESCE(SUM(p.total_earnings), 0) INTO v_weekly_income
  FROM agency_hosts ah
  JOIN profiles p ON p.id = ah.host_id
  WHERE ah.agency_id = v_agency_id AND ah.status = 'active';

  -- Determine level based on weekly income (using agency_level_tiers)
  SELECT level_code, commission_rate INTO v_new_level, v_new_commission
  FROM agency_level_tiers
  WHERE is_active = true
    AND v_weekly_income >= min_weekly_income
  ORDER BY min_weekly_income DESC
  LIMIT 1;

  -- Default to A1/3% if no tier matches
  v_new_level := COALESCE(v_new_level, 'A1');
  v_new_commission := COALESCE(v_new_commission, 3);

  -- Update agency level (only upgrade, never downgrade within same week)
  UPDATE agencies
  SET level = v_new_level,
      commission_rate = v_new_commission,
      updated_at = now()
  WHERE id = v_agency_id
    AND (
      -- Only update if new level is higher
      COALESCE(commission_rate, 3) < v_new_commission
      OR level IS NULL
    );

  RETURN NEW;
END;
$$;

-- Create trigger on profiles table for automatic agency level updates
DROP TRIGGER IF EXISTS trg_update_agency_level ON profiles;
CREATE TRIGGER trg_update_agency_level
  AFTER UPDATE OF total_earnings ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_agency_level_on_earnings();
