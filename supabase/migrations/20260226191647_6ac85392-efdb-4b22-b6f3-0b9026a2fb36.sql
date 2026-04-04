
-- Function: Check agencies and deactivate if < 10 active hosts after 1 month
CREATE OR REPLACE FUNCTION public.check_agency_minimum_hosts()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_agency RECORD;
  v_active_host_count INTEGER;
BEGIN
  -- Loop through all active agencies that are at least 1 month old
  FOR v_agency IN
    SELECT a.id, a.name, a.agency_code, a.created_at, a.owner_id
    FROM agencies a
    WHERE a.is_active = true
      AND a.created_at <= (now() - INTERVAL '30 days')
  LOOP
    -- Count active hosts for this agency
    SELECT COUNT(*)
    INTO v_active_host_count
    FROM agency_hosts ah
    WHERE ah.agency_id = v_agency.id
      AND ah.status = 'active';

    -- If less than 10 active hosts, deactivate the agency
    IF v_active_host_count < 10 THEN
      UPDATE agencies
      SET is_active = false,
          blocked_at = now(),
          blocked_reason = 'অটো-ডিঅ্যাক্টিভ: ১ মাসে ১০টি অ্যাক্টিভ হোস্ট পূরণ হয়নি। বর্তমান হোস্ট: ' || v_active_host_count::text,
          updated_at = now()
      WHERE id = v_agency.id;

      RAISE NOTICE 'Agency % (%) deactivated: only % active hosts', v_agency.name, v_agency.agency_code, v_active_host_count;
    END IF;
  END LOOP;
END;
$$;
