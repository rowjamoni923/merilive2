
-- Update join_agency to send notification to agency owner when a host requests to join
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
BEGIN
  v_normalized_code := upper(trim(_agency_code));

  -- Find the agency
  SELECT id, owner_id, name INTO v_agency_id, v_agency_owner_id, v_agency_name
  FROM agencies
  WHERE upper(trim(agency_code)) = v_normalized_code
    AND is_active = true;

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

  -- Create join request
  INSERT INTO agency_hosts (host_id, agency_id, status, joined_via, joined_at)
  VALUES (_host_id, v_agency_id, 'pending', _joined_via, NOW());

  -- Get host display name
  SELECT COALESCE(display_name, 'Unknown User') INTO v_host_name
  FROM profiles WHERE id = _host_id;

  -- Send notification to agency owner
  INSERT INTO notifications (user_id, type, title, message, data, is_read)
  VALUES (
    v_agency_owner_id,
    'agency_host_request',
    '👥 New Host Request',
    v_host_name || ' wants to join your agency ' || v_agency_name,
    jsonb_build_object(
      'host_id', _host_id,
      'host_name', v_host_name,
      'agency_id', v_agency_id,
      'agency_name', v_agency_name,
      'action_url', '/agency-dashboard'
    ),
    false
  );

  RETURN true;
END;
$function$;

-- Update approve_host_request to notify the host
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
BEGIN
  SELECT owner_id, name INTO _agency_owner_id, _agency_name
  FROM public.agencies
  WHERE id = _agency_id;
  
  IF _agency_owner_id != _approver_id THEN
    RETURN FALSE;
  END IF;
  
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

-- Update reject_host_request to notify the host
CREATE OR REPLACE FUNCTION public.reject_host_request(
  _agency_id UUID,
  _host_id UUID,
  _rejector_id UUID,
  _rejection_reason TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _agency_owner_id UUID;
  _agency_name TEXT;
BEGIN
  SELECT owner_id, name INTO _agency_owner_id, _agency_name
  FROM public.agencies
  WHERE id = _agency_id;
  
  IF _agency_owner_id != _rejector_id THEN
    RETURN FALSE;
  END IF;
  
  UPDATE public.agency_hosts
  SET status = 'rejected'
  WHERE agency_id = _agency_id AND host_id = _host_id AND status = 'pending';
  
  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  -- Notify the host that they've been rejected
  INSERT INTO notifications (user_id, type, title, message, data, is_read)
  VALUES (
    _host_id,
    'host_rejected',
    '❌ Agency Request Rejected',
    'Your request to join ' || COALESCE(_agency_name, 'the agency') || ' was not approved.' || 
      CASE WHEN _rejection_reason IS NOT NULL THEN ' Reason: ' || _rejection_reason ELSE '' END,
    jsonb_build_object(
      'agency_id', _agency_id,
      'agency_name', _agency_name,
      'rejection_reason', _rejection_reason,
      'action_url', '/join-agency'
    ),
    false
  );
  
  RETURN TRUE;
END;
$$;
