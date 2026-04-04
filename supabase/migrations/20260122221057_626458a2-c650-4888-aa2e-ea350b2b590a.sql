-- Drop both existing join_agency functions to avoid ambiguity
DROP FUNCTION IF EXISTS public.join_agency(_agency_code text, _host_id uuid, _joined_via text);
DROP FUNCTION IF EXISTS public.join_agency(_host_id uuid, _agency_code text, _joined_via text);

-- Create a single, consistent join_agency function
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
  v_existing_record_id uuid;
BEGIN
  -- Find the agency by code
  SELECT id INTO v_agency_id
  FROM agencies
  WHERE agency_code = _agency_code AND is_active = true;
  
  IF v_agency_id IS NULL THEN
    RAISE EXCEPTION 'Agency not found or inactive';
  END IF;
  
  -- Check if host is already in this agency
  SELECT id INTO v_existing_record_id
  FROM agency_hosts
  WHERE host_id = _host_id AND agency_id = v_agency_id AND status = 'active';
  
  IF v_existing_record_id IS NOT NULL THEN
    RAISE EXCEPTION 'Already a member of this agency';
  END IF;
  
  -- Check if there's a pending request
  SELECT id INTO v_existing_record_id
  FROM agency_hosts
  WHERE host_id = _host_id AND agency_id = v_agency_id AND status = 'pending';
  
  IF v_existing_record_id IS NOT NULL THEN
    RAISE EXCEPTION 'Join request already pending';
  END IF;
  
  -- Create join request
  INSERT INTO agency_hosts (host_id, agency_id, status, joined_via, joined_at)
  VALUES (_host_id, v_agency_id, 'pending', _joined_via, NOW());
  
  RETURN true;
END;
$$;