
-- Update check_agency_host_compliance to skip payroll-enabled agencies
CREATE OR REPLACE FUNCTION public.check_agency_host_compliance()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_agency RECORD;
  v_active_host_count INTEGER;
  v_has_payroll BOOLEAN;
BEGIN
  FOR v_agency IN
    SELECT a.id, a.name, a.agency_code, a.owner_id
    FROM agencies a
    WHERE a.is_active = true
      AND a.created_at <= (now() - INTERVAL '7 days')
  LOOP
    -- Check if agency owner has payroll enabled
    SELECT EXISTS(
      SELECT 1 FROM topup_helpers th
      WHERE th.user_id = v_agency.owner_id
        AND th.is_verified = true
        AND th.payroll_enabled = true
    ) INTO v_has_payroll;

    -- Skip payroll-enabled agencies
    IF v_has_payroll THEN
      CONTINUE;
    END IF;

    -- Count active hosts for this agency
    SELECT count(*) INTO v_active_host_count
    FROM agency_hosts ah
    WHERE ah.agency_id = v_agency.id
      AND ah.status = 'active';

    -- If less than 10 active hosts, deactivate the agency
    IF v_active_host_count < 10 THEN
      UPDATE agencies
      SET is_active = false,
          is_blocked = true,
          blocked_reason = 'Auto-deactivated: Failed to recruit 10 active hosts within 7 days (had ' || v_active_host_count || ')',
          blocked_at = now(),
          updated_at = now()
      WHERE id = v_agency.id;

      RAISE NOTICE 'Agency % (%) deactivated: only % active hosts', v_agency.name, v_agency.agency_code, v_active_host_count;
    END IF;
  END LOOP;
END;
$$;

-- Also update the old check_agency_minimum_hosts to match (7 days + payroll skip)
CREATE OR REPLACE FUNCTION public.check_agency_minimum_hosts()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Delegate to the unified compliance function
  PERFORM check_agency_host_compliance();
END;
$$;
