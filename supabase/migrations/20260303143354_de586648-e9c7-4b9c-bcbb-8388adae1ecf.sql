-- Create a SECURITY DEFINER function for agency creation that bypasses trigger protection
CREATE OR REPLACE FUNCTION public.create_agency_for_user(
  _owner_id uuid,
  _name text,
  _agency_code text,
  _level text DEFAULT 'A1',
  _commission_rate numeric DEFAULT 3,
  _email text DEFAULT null,
  _whatsapp text DEFAULT null
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_agency_id uuid;
  v_existing_agency_id uuid;
BEGIN
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

  -- Create the agency
  INSERT INTO agencies (name, agency_code, owner_id, level, commission_rate, wallet_balance, total_hosts, total_agents, is_active, email, whatsapp_number)
  VALUES (_name, _agency_code, _owner_id, _level, _commission_rate, 0, 0, 0, true, _email, _whatsapp)
  RETURNING id INTO v_agency_id;

  -- Update profile with agency info (bypasses protect_sensitive_columns_trigger via SECURITY DEFINER)
  UPDATE profiles
  SET is_agency_owner = true, agency_id = v_agency_id
  WHERE id = _owner_id;

  RETURN jsonb_build_object(
    'success', true,
    'agency_id', v_agency_id,
    'agency_code', _agency_code
  );
END;
$$;