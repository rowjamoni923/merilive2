-- Fix join_agency to handle duplicate key by cleaning up old rejected/left records first
CREATE OR REPLACE FUNCTION public.join_agency(
  _host_id uuid,
  _agency_code text,
  _joined_via text DEFAULT 'code'
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_agency_id uuid;
  v_existing_id uuid;
  v_existing_status text;
BEGIN
  -- Find the agency by code
  SELECT id INTO v_agency_id
  FROM agencies
  WHERE agency_code = _agency_code AND is_active = true;
  
  IF v_agency_id IS NULL THEN
    RAISE EXCEPTION 'Agency not found or inactive';
  END IF;
  
  -- Check if host has ANY existing record (any agency, since host_id is unique)
  SELECT id, status INTO v_existing_id, v_existing_status
  FROM agency_hosts
  WHERE host_id = _host_id
  LIMIT 1;
  
  IF v_existing_id IS NOT NULL THEN
    -- If active in any agency, block
    IF v_existing_status = 'active' THEN
      RAISE EXCEPTION 'Already a member of an agency';
    END IF;
    
    -- If pending for this same agency, block
    IF v_existing_status = 'pending' THEN
      SELECT id INTO v_existing_id
      FROM agency_hosts
      WHERE host_id = _host_id AND agency_id = v_agency_id AND status = 'pending';
      
      IF v_existing_id IS NOT NULL THEN
        RAISE EXCEPTION 'Join request already pending';
      END IF;
    END IF;
    
    -- Delete old rejected/left/pending records to avoid unique constraint violation
    DELETE FROM agency_hosts
    WHERE host_id = _host_id AND status IN ('rejected', 'left', 'removed', 'pending');
  END IF;
  
  -- Create join request
  INSERT INTO agency_hosts (host_id, agency_id, status, joined_via, joined_at)
  VALUES (_host_id, v_agency_id, 'pending', _joined_via, NOW());
  
  RETURN true;
END;
$$;