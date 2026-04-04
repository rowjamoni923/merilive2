
-- ============================================
-- Fix 1: Update join_agency to handle sub-agent referral codes
-- If the code matches a sub_agent referral_code, auto-resolve the agency
-- and track which sub-agent referred the host
-- ============================================

CREATE OR REPLACE FUNCTION public.join_agency(_host_id uuid, _agency_code text, _joined_via text DEFAULT 'code'::text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_agency_id uuid;
  v_normalized_code text;
  v_existing record;
  v_agency_owner_id uuid;
  v_agency_name text;
  v_host_name text;
  v_sub_agent_code text := NULL;
BEGIN
  v_normalized_code := upper(trim(_agency_code));

  -- First try: match against agency_code directly
  SELECT id, owner_id, name INTO v_agency_id, v_agency_owner_id, v_agency_name
  FROM agencies
  WHERE upper(trim(agency_code)) = v_normalized_code
    AND is_active = true;

  -- Second try: if not found, check if it's a sub-agent referral code
  IF v_agency_id IS NULL THEN
    SELECT sa.agency_id, a.owner_id, a.name, sa.referral_code
    INTO v_agency_id, v_agency_owner_id, v_agency_name, v_sub_agent_code
    FROM sub_agents sa
    JOIN agencies a ON a.id = sa.agency_id
    WHERE upper(trim(sa.referral_code)) = v_normalized_code
      AND sa.status = 'active'
      AND a.is_active = true;
  END IF;

  IF v_agency_id IS NULL THEN
    RAISE EXCEPTION 'Agency not found. Please check the code and try again.';
  END IF;

  -- Check if user already owns an agency
  IF EXISTS (SELECT 1 FROM profiles WHERE id = _host_id AND is_agency_owner = true) THEN
    RAISE EXCEPTION 'You already own an agency. Agency owners cannot join another agency as a host.';
  END IF;

  -- Get existing record for this host
  SELECT id, status, agency_id INTO v_existing
  FROM agency_hosts
  WHERE host_id = _host_id;

  IF v_existing IS NOT NULL THEN
    IF v_existing.status = 'active' THEN
      RAISE EXCEPTION 'You are already an active member of an agency. Please leave your current agency first.';
    END IF;
    IF v_existing.status = 'pending' AND v_existing.agency_id = v_agency_id THEN
      RAISE EXCEPTION 'You have already applied to this agency. Please wait for approval.';
    END IF;
    IF v_existing.status = 'pending' AND v_existing.agency_id != v_agency_id THEN
      RAISE EXCEPTION 'You have already applied to another agency. Please cancel that request first before applying to a new one.';
    END IF;
    DELETE FROM agency_hosts WHERE id = v_existing.id;
  END IF;

  -- Create join request (store sub-agent referral code if applicable)
  INSERT INTO agency_hosts (host_id, agency_id, status, joined_via, joined_at, referral_code)
  VALUES (_host_id, v_agency_id, 'pending', _joined_via, NOW(), v_sub_agent_code);

  -- Get host display name
  SELECT COALESCE(display_name, 'Unknown User') INTO v_host_name
  FROM profiles WHERE id = _host_id;

  -- Send notification to agency owner
  INSERT INTO notifications (user_id, type, title, message, data, is_read)
  VALUES (
    v_agency_owner_id,
    'agency_host_request',
    '👥 New Host Request',
    v_host_name || ' wants to join your agency ' || v_agency_name ||
      CASE WHEN v_sub_agent_code IS NOT NULL THEN ' (via Sub-Agent: ' || v_sub_agent_code || ')' ELSE '' END,
    jsonb_build_object(
      'host_id', _host_id,
      'host_name', v_host_name,
      'agency_id', v_agency_id,
      'agency_name', v_agency_name,
      'referral_code', COALESCE(v_sub_agent_code, ''),
      'action_url', '/agency-dashboard'
    ),
    false
  );

  RETURN true;
END;
$function$;

-- ============================================
-- Fix 2: Update approve_host_request to increment sub-agent total_referrals
-- ============================================

CREATE OR REPLACE FUNCTION public.approve_host_request(
  _agency_id UUID,
  _host_id UUID,
  _approver_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _agency_owner_id UUID;
  _agency_name TEXT;
  _referral_code_used TEXT;
BEGIN
  SELECT owner_id, name INTO _agency_owner_id, _agency_name
  FROM public.agencies
  WHERE id = _agency_id;
  
  IF _agency_owner_id != _approver_id THEN
    RETURN FALSE;
  END IF;
  
  -- Get the referral code before updating
  SELECT referral_code INTO _referral_code_used
  FROM public.agency_hosts
  WHERE agency_id = _agency_id AND host_id = _host_id AND status = 'pending';

  UPDATE public.agency_hosts
  SET status = 'active', joined_at = now()
  WHERE agency_id = _agency_id AND host_id = _host_id AND status = 'pending';
  
  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;
  
  UPDATE public.profiles
  SET agency_id = _agency_id
  WHERE id = _host_id;
  
  UPDATE public.agencies
  SET total_hosts = COALESCE(total_hosts, 0) + 1
  WHERE id = _agency_id;

  -- Increment sub-agent's total_referrals if host joined via sub-agent link
  IF _referral_code_used IS NOT NULL AND _referral_code_used != '' THEN
    UPDATE public.sub_agents
    SET total_referrals = COALESCE(total_referrals, 0) + 1
    WHERE referral_code = _referral_code_used
      AND agency_id = _agency_id
      AND status = 'active';
  END IF;

  -- Notify the host that they've been approved
  INSERT INTO notifications (user_id, type, title, message, data, is_read)
  VALUES (
    _host_id,
    'agency_joined',
    '🎉 Agency Request Approved!',
    'You have been approved to join ' || COALESCE(_agency_name, 'the agency') || '. Welcome!',
    jsonb_build_object(
      'agency_id', _agency_id,
      'agency_name', _agency_name,
      'action_url', '/agency'
    ),
    false
  );
  
  RETURN TRUE;
END;
$$;
