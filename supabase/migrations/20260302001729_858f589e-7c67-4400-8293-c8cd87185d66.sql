-- Update agency auto-deactivation: 30 days → 7 days
CREATE OR REPLACE FUNCTION public.check_agency_host_compliance()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_agency RECORD;
  v_active_host_count INTEGER;
BEGIN
  FOR v_agency IN
    SELECT a.id, a.name, a.agency_code
    FROM agencies a
    WHERE a.is_active = true
      AND a.created_at <= (now() - INTERVAL '7 days')
  LOOP
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
          blocked_at = now()
      WHERE id = v_agency.id;

      RAISE NOTICE 'Agency % (%) deactivated: only % active hosts', v_agency.name, v_agency.agency_code, v_active_host_count;
    END IF;
  END LOOP;
END;
$$;