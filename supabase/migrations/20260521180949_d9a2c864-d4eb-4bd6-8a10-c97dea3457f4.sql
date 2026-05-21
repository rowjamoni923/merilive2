-- Pkg72: Recreate join_agency with optional sub-agent referral_code
DROP FUNCTION IF EXISTS public.join_agency(uuid, text, text);

CREATE OR REPLACE FUNCTION public.join_agency(
  _host_id uuid,
  _agency_code text,
  _joined_via text DEFAULT 'code',
  _referral_code text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_agency_id uuid;
  v_existing_id uuid;
  v_existing_status text;
  v_referral_code text;
  v_sub_agent_agency uuid;
BEGIN
  -- Resolve agency by code
  SELECT id INTO v_agency_id
  FROM agencies
  WHERE agency_code = _agency_code AND is_active = true;

  IF v_agency_id IS NULL THEN
    RAISE EXCEPTION 'Agency not found or inactive';
  END IF;

  -- Validate sub-agent referral_code (if provided) belongs to this agency
  v_referral_code := NULLIF(trim(_referral_code), '');
  IF v_referral_code IS NOT NULL THEN
    SELECT agency_id INTO v_sub_agent_agency
    FROM sub_agents
    WHERE referral_code = upper(v_referral_code)
      AND status = 'active'
    LIMIT 1;

    -- Silently ignore mismatched referral (don't block the join)
    IF v_sub_agent_agency IS DISTINCT FROM v_agency_id THEN
      v_referral_code := NULL;
    ELSE
      v_referral_code := upper(v_referral_code);
    END IF;
  END IF;

  -- Look at host's most-recent membership row (deterministic)
  SELECT id, status INTO v_existing_id, v_existing_status
  FROM agency_hosts
  WHERE host_id = _host_id
  ORDER BY joined_at DESC NULLS LAST, id DESC
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    IF v_existing_status = 'active' THEN
      RAISE EXCEPTION 'Already a member of an agency';
    END IF;

    IF v_existing_status = 'pending' THEN
      IF EXISTS (
        SELECT 1 FROM agency_hosts
        WHERE host_id = _host_id AND agency_id = v_agency_id AND status = 'pending'
      ) THEN
        RAISE EXCEPTION 'Join request already pending';
      END IF;
    END IF;

    -- Clear stale non-active rows before inserting new pending
    DELETE FROM agency_hosts
    WHERE host_id = _host_id AND status IN ('rejected', 'left', 'removed', 'pending');
  END IF;

  INSERT INTO agency_hosts (host_id, agency_id, status, joined_via, joined_at, referral_code)
  VALUES (_host_id, v_agency_id, 'pending', _joined_via, NOW(), v_referral_code);

  RETURN true;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.join_agency(uuid, text, text, text) TO authenticated, anon, service_role;