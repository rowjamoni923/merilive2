
-- Fix the trigger to also check for a session bypass flag
CREATE OR REPLACE FUNCTION public.protect_sensitive_profile_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- If current_user differs from session_user, we're inside a SECURITY DEFINER function - allow
  IF current_user IS DISTINCT FROM session_user THEN
    RETURN NEW;
  END IF;

  -- Check for authorized internal bypass (used by cron jobs / SECURITY DEFINER RPCs)
  BEGIN
    IF current_setting('app.bypass_profile_protection', true) = 'true' THEN
      RETURN NEW;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    -- Setting doesn't exist, continue with protection
    NULL;
  END;

  -- Block direct modifications by regular users
  IF NEW.coins IS DISTINCT FROM OLD.coins THEN
    RAISE EXCEPTION 'Direct modification of coins is not allowed';
  END IF;
  IF NEW.beans IS DISTINCT FROM OLD.beans THEN
    RAISE EXCEPTION 'Direct modification of beans is not allowed';
  END IF;
  IF NEW.diamonds IS DISTINCT FROM OLD.diamonds THEN
    RAISE EXCEPTION 'Direct modification of diamonds is not allowed';
  END IF;
  IF NEW.total_earnings IS DISTINCT FROM OLD.total_earnings THEN
    RAISE EXCEPTION 'Direct modification of total_earnings is not allowed';
  END IF;
  IF NEW.pending_earnings IS DISTINCT FROM OLD.pending_earnings THEN
    RAISE EXCEPTION 'Direct modification of pending_earnings is not allowed';
  END IF;
  IF NEW.weekly_earnings IS DISTINCT FROM OLD.weekly_earnings THEN
    RAISE EXCEPTION 'Direct modification of weekly_earnings is not allowed';
  END IF;
  IF NEW.total_consumption IS DISTINCT FROM OLD.total_consumption THEN
    RAISE EXCEPTION 'Direct modification of total_consumption is not allowed';
  END IF;
  IF NEW.total_recharged IS DISTINCT FROM OLD.total_recharged THEN
    RAISE EXCEPTION 'Direct modification of total_recharged is not allowed';
  END IF;
  IF NEW.is_host IS DISTINCT FROM OLD.is_host THEN
    RAISE EXCEPTION 'Direct modification of is_host is not allowed';
  END IF;
  IF NEW.host_status IS DISTINCT FROM OLD.host_status THEN
    RAISE EXCEPTION 'Direct modification of host_status is not allowed';
  END IF;
  IF NEW.host_level IS DISTINCT FROM OLD.host_level THEN
    RAISE EXCEPTION 'Direct modification of host_level is not allowed';
  END IF;
  IF NEW.is_verified IS DISTINCT FROM OLD.is_verified THEN
    RAISE EXCEPTION 'Direct modification of is_verified is not allowed';
  END IF;
  IF NEW.is_face_verified IS DISTINCT FROM OLD.is_face_verified THEN
    RAISE EXCEPTION 'Direct modification of is_face_verified is not allowed';
  END IF;
  IF NEW.user_level IS DISTINCT FROM OLD.user_level THEN
    RAISE EXCEPTION 'Direct modification of user_level is not allowed';
  END IF;
  IF NEW.max_user_level IS DISTINCT FROM OLD.max_user_level THEN
    RAISE EXCEPTION 'Direct modification of max_user_level is not allowed';
  END IF;
  IF NEW.current_vip_tier_id IS DISTINCT FROM OLD.current_vip_tier_id THEN
    RAISE EXCEPTION 'Direct modification of current_vip_tier_id is not allowed';
  END IF;
  IF NEW.vip_expires_at IS DISTINCT FROM OLD.vip_expires_at THEN
    RAISE EXCEPTION 'Direct modification of vip_expires_at is not allowed';
  END IF;
  IF NEW.is_blocked IS DISTINCT FROM OLD.is_blocked THEN
    RAISE EXCEPTION 'Direct modification of is_blocked is not allowed';
  END IF;
  IF NEW.agency_id IS DISTINCT FROM OLD.agency_id THEN
    RAISE EXCEPTION 'Direct modification of agency_id is not allowed';
  END IF;
  IF NEW.is_agency_owner IS DISTINCT FROM OLD.is_agency_owner THEN
    RAISE EXCEPTION 'Direct modification of is_agency_owner is not allowed';
  END IF;
  IF NEW.face_hash IS DISTINCT FROM OLD.face_hash THEN
    RAISE EXCEPTION 'Direct modification of face_hash is not allowed';
  END IF;
  IF NEW.phone_violation_count IS DISTINCT FROM OLD.phone_violation_count THEN
    RAISE EXCEPTION 'Direct modification of phone_violation_count is not allowed';
  END IF;

  RETURN NEW;
END;
$$;

-- Now update process_weekly_agency_transfers to set the bypass flag
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
  -- Set bypass flag for trigger protection (LOCAL = transaction-scoped only)
  PERFORM set_config('app.bypass_profile_protection', 'true', true);

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

        -- Now this will work because bypass flag is set
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

  -- Clear bypass flag
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
