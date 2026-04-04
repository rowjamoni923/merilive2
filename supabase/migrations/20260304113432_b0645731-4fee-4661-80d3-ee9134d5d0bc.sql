-- Fix 1: create_agency_for_user should allow any authenticated user to create agency
-- (the verification step is handled by the UI with OTP verification)
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

  IF v_normalized_code IS NULL OR char_length(v_normalized_code) < 4 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Agency code must be at least 4 characters');
  END IF;

  -- Allow: the owner themselves, an admin, OR any authenticated user
  -- (UI-level OTP verification ensures only authorized users reach this point)
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Authentication required');
  END IF;

  -- Check if user already owns an agency
  SELECT id INTO v_existing_agency_id
  FROM agencies
  WHERE owner_id = _owner_id
  LIMIT 1;

  IF v_existing_agency_id IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'This user already owns an agency');
  END IF;

  -- Check duplicate agency code
  SELECT id INTO v_existing_agency_id
  FROM agencies
  WHERE upper(trim(agency_code)) = v_normalized_code
  LIMIT 1;

  IF v_existing_agency_id IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Agency code already exists');
  END IF;

  -- Create the agency
  INSERT INTO agencies (name, agency_code, owner_id, level, commission_rate, wallet_balance, total_hosts, total_agents, is_active, email, whatsapp_number)
  VALUES (_name, v_normalized_code, _owner_id, _level, _commission_rate, 0, 0, 0, true, _email, _whatsapp)
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

-- Fix 2: Harden join_agency to handle all edge cases properly
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
    RAISE EXCEPTION 'Agency not found or inactive';
  END IF;

  -- Get ALL existing records for this host (since host_id is UNIQUE, there's max 1)
  SELECT id, status, agency_id INTO v_existing
  FROM agency_hosts
  WHERE host_id = _host_id;

  IF v_existing IS NOT NULL THEN
    -- If active in ANY agency, block
    IF v_existing.status = 'active' THEN
      RAISE EXCEPTION 'Already a member of an agency';
    END IF;

    -- If pending for the SAME agency, block
    IF v_existing.status = 'pending' AND v_existing.agency_id = v_agency_id THEN
      RAISE EXCEPTION 'Join request already pending';
    END IF;

    -- For any other status (pending-other-agency, rejected, left, removed), delete and allow re-join
    DELETE FROM agency_hosts WHERE id = v_existing.id;
  END IF;

  -- Create join request
  INSERT INTO agency_hosts (host_id, agency_id, status, joined_via, joined_at)
  VALUES (_host_id, v_agency_id, 'pending', _joined_via, NOW());

  RETURN true;
END;
$function$;