
-- Update join_agency to show clear messages instead of silently deleting
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
BEGIN
  v_normalized_code := upper(trim(_agency_code));

  -- Find the agency
  SELECT id INTO v_agency_id
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
    -- If active in ANY agency, block
    IF v_existing.status = 'active' THEN
      RAISE EXCEPTION 'You are already an active member of an agency. Please leave your current agency first.';
    END IF;

    -- If pending for the SAME agency, block
    IF v_existing.status = 'pending' AND v_existing.agency_id = v_agency_id THEN
      RAISE EXCEPTION 'You have already applied to this agency. Please wait for approval.';
    END IF;

    -- If pending for a DIFFERENT agency, block with clear message
    IF v_existing.status = 'pending' AND v_existing.agency_id != v_agency_id THEN
      RAISE EXCEPTION 'You have already applied to another agency. Please cancel that request first before applying to a new one.';
    END IF;

    -- For rejected, left, removed — allow re-join by deleting old record
    DELETE FROM agency_hosts WHERE id = v_existing.id;
  END IF;

  -- Create join request
  INSERT INTO agency_hosts (host_id, agency_id, status, joined_via, joined_at)
  VALUES (_host_id, v_agency_id, 'pending', _joined_via, NOW());

  RETURN true;
END;
$function$;

-- Also update create_agency_for_user with clearer English messages
CREATE OR REPLACE FUNCTION public.create_agency_for_user(
  _owner_id uuid,
  _name text,
  _agency_code text,
  _level text DEFAULT 'A1'::text,
  _commission_rate numeric DEFAULT 3,
  _email text DEFAULT NULL::text,
  _whatsapp text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_agency_id uuid;
  v_existing_agency_id uuid;
  v_normalized_code text;
BEGIN
  v_normalized_code := upper(trim(_agency_code));

  -- Authentication check
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'You must be logged in to create an agency.');
  END IF;

  -- Validate agency name
  IF _name IS NULL OR char_length(trim(_name)) < 2 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Agency name must be at least 2 characters long.');
  END IF;

  -- Validate agency code
  IF v_normalized_code IS NULL OR char_length(v_normalized_code) < 4 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Agency code must be at least 4 characters long.');
  END IF;

  -- Check if user already owns an agency
  SELECT id INTO v_existing_agency_id
  FROM agencies
  WHERE owner_id = _owner_id
  LIMIT 1;

  IF v_existing_agency_id IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'You already own an agency. Each user can only create one agency.');
  END IF;

  -- Check if user is currently a host in another agency
  IF EXISTS (SELECT 1 FROM agency_hosts WHERE host_id = _owner_id AND status = 'active') THEN
    RETURN jsonb_build_object('success', false, 'error', 'You are currently an active host in another agency. Please leave that agency first.');
  END IF;

  -- Check if user has a pending join request
  IF EXISTS (SELECT 1 FROM agency_hosts WHERE host_id = _owner_id AND status = 'pending') THEN
    RETURN jsonb_build_object('success', false, 'error', 'You have a pending join request at another agency. Please cancel it first.');
  END IF;

  -- Check duplicate agency code
  SELECT id INTO v_existing_agency_id
  FROM agencies
  WHERE upper(trim(agency_code)) = v_normalized_code
  LIMIT 1;

  IF v_existing_agency_id IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'This agency code is already taken. Please choose a different code.');
  END IF;

  -- Create the agency
  INSERT INTO agencies (name, agency_code, owner_id, level, commission_rate, wallet_balance, total_hosts, total_agents, is_active, email, whatsapp_number)
  VALUES (trim(_name), v_normalized_code, _owner_id, _level, _commission_rate, 0, 0, 0, true, _email, _whatsapp)
  RETURNING id INTO v_agency_id;

  -- Update profile with agency info
  UPDATE profiles
  SET is_agency_owner = true, agency_id = v_agency_id
  WHERE id = _owner_id;

  RETURN jsonb_build_object(
    'success', true,
    'agency_id', v_agency_id,
    'agency_code', v_normalized_code
  );
END;
$function$;
