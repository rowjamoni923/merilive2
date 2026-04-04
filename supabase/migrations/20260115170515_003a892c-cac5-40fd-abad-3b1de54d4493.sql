-- Update join_agency function to set pending status instead of auto-approving
CREATE OR REPLACE FUNCTION public.join_agency(
  _agency_code TEXT,
  _host_id UUID,
  _joined_via TEXT DEFAULT 'code'
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _agency_id UUID;
  _existing_status TEXT;
BEGIN
  -- Get agency id from code
  SELECT id INTO _agency_id
  FROM public.agencies
  WHERE agency_code = _agency_code
  AND is_active = true;
  
  IF _agency_id IS NULL THEN
    RETURN FALSE;
  END IF;
  
  -- Check if already in an agency_hosts
  SELECT status INTO _existing_status 
  FROM public.agency_hosts 
  WHERE host_id = _host_id;
  
  IF _existing_status IS NOT NULL THEN
    -- If already pending or active, return false
    IF _existing_status IN ('pending', 'active') THEN
      RETURN FALSE;
    END IF;
  END IF;
  
  -- Delete any previous rejected/left records for this host
  DELETE FROM public.agency_hosts WHERE host_id = _host_id;
  
  -- Insert into agency_hosts with PENDING status (not active)
  INSERT INTO public.agency_hosts (agency_id, host_id, joined_via, referral_code, status)
  VALUES (_agency_id, _host_id, _joined_via, _agency_code, 'pending');
  
  -- Do NOT update profile agency_id yet - wait for approval
  -- Do NOT increment host count yet - wait for approval
  
  RETURN TRUE;
END;
$$;

-- Create function to approve host request
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
BEGIN
  -- Verify approver is agency owner
  SELECT owner_id INTO _agency_owner_id
  FROM public.agencies
  WHERE id = _agency_id;
  
  IF _agency_owner_id != _approver_id THEN
    RETURN FALSE;
  END IF;
  
  -- Update agency_hosts status to active
  UPDATE public.agency_hosts
  SET status = 'active', joined_at = now()
  WHERE agency_id = _agency_id AND host_id = _host_id AND status = 'pending';
  
  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;
  
  -- Update profile with agency_id
  UPDATE public.profiles
  SET agency_id = _agency_id
  WHERE id = _host_id;
  
  -- Increment agency host count
  UPDATE public.agencies
  SET total_hosts = COALESCE(total_hosts, 0) + 1
  WHERE id = _agency_id;
  
  RETURN TRUE;
END;
$$;

-- Create function to reject host request
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
BEGIN
  -- Verify rejector is agency owner
  SELECT owner_id INTO _agency_owner_id
  FROM public.agencies
  WHERE id = _agency_id;
  
  IF _agency_owner_id != _rejector_id THEN
    RETURN FALSE;
  END IF;
  
  -- Update agency_hosts status to rejected
  UPDATE public.agency_hosts
  SET status = 'rejected', left_at = now()
  WHERE agency_id = _agency_id AND host_id = _host_id AND status = 'pending';
  
  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;
  
  RETURN TRUE;
END;
$$;

-- Create function to get host's pending agency request
CREATE OR REPLACE FUNCTION public.get_host_agency_request(_host_id UUID)
RETURNS TABLE (
  agency_id UUID,
  agency_name TEXT,
  agency_code TEXT,
  agency_level TEXT,
  agency_logo_url TEXT,
  status TEXT,
  requested_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    a.id as agency_id,
    a.name as agency_name,
    a.agency_code,
    a.level as agency_level,
    a.logo_url as agency_logo_url,
    ah.status,
    ah.joined_at as requested_at
  FROM public.agency_hosts ah
  JOIN public.agencies a ON a.id = ah.agency_id
  WHERE ah.host_id = _host_id
  ORDER BY ah.joined_at DESC
  LIMIT 1;
END;
$$;