-- Normalize agency code handling across lookup/join/create flows

CREATE OR REPLACE FUNCTION public.get_agency_by_code(agency_code text)
RETURNS TABLE(id uuid, name text, level text, total_hosts integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT a.id, a.name, a.level, a.total_hosts
  FROM public.agencies a
  WHERE upper(trim(a.agency_code)) = upper(trim(get_agency_by_code.agency_code))
    AND a.is_active = true
  LIMIT 1;
$function$;

CREATE OR REPLACE FUNCTION public.join_agency(_host_id uuid, _agency_code text, _joined_via text DEFAULT 'code'::text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_agency_id uuid;
  v_existing_id uuid;
  v_existing_status text;
  v_normalized_code text;
BEGIN
  v_normalized_code := upper(trim(_agency_code));

  -- Find the agency by normalized code
  SELECT id INTO v_agency_id
  FROM agencies
  WHERE upper(trim(agency_code)) = v_normalized_code
    AND is_active = true;

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
$function$;

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

  -- Validate caller is the owner themselves or an admin
  IF auth.uid() != _owner_id AND NOT public.is_admin(auth.uid()) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  -- Check if user already owns an agency
  SELECT id INTO v_existing_agency_id
  FROM agencies
  WHERE owner_id = _owner_id
  LIMIT 1;

  IF v_existing_agency_id IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'This user already owns an agency');
  END IF;

  -- Create the agency (always persist normalized uppercase code)
  INSERT INTO agencies (name, agency_code, owner_id, level, commission_rate, wallet_balance, total_hosts, total_agents, is_active, email, whatsapp_number)
  VALUES (_name, v_normalized_code, _owner_id, _level, _commission_rate, 0, 0, 0, true, _email, _whatsapp)
  RETURNING id INTO v_agency_id;

  -- Update profile with agency info (bypasses protect_sensitive_columns_trigger via SECURITY DEFINER)
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