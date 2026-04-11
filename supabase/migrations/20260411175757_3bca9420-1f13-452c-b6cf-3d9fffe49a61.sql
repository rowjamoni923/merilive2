
CREATE OR REPLACE FUNCTION public.create_agency_for_user(
  _owner_id UUID,
  _name TEXT,
  _agency_code TEXT,
  _level TEXT DEFAULT 'A1',
  _commission_rate NUMERIC DEFAULT 3,
  _email TEXT DEFAULT NULL,
  _whatsapp TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _new_agency_id UUID;
BEGIN
  -- Check if user already owns an agency
  IF EXISTS (SELECT 1 FROM profiles WHERE id = _owner_id AND is_agency_owner = true) THEN
    RETURN jsonb_build_object('success', false, 'error', 'User already owns an agency');
  END IF;

  -- Check if user is already in an agency
  IF EXISTS (SELECT 1 FROM profiles WHERE id = _owner_id AND agency_id IS NOT NULL) THEN
    RETURN jsonb_build_object('success', false, 'error', 'User is already part of an agency');
  END IF;

  -- Check if agency code already exists
  IF EXISTS (SELECT 1 FROM agencies WHERE agency_code = _agency_code) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Agency code already exists');
  END IF;

  -- Create the agency
  INSERT INTO agencies (
    name, agency_code, owner_id, level, commission_rate,
    email, whatsapp_number,
    wallet_balance, diamond_balance, beans_balance,
    total_hosts, total_agents, is_active
  ) VALUES (
    _name, _agency_code, _owner_id, _level, _commission_rate,
    _email, _whatsapp,
    0, 0, 0,
    0, 0, true
  )
  RETURNING id INTO _new_agency_id;

  -- Update user profile
  UPDATE profiles
  SET is_agency_owner = true, agency_id = _new_agency_id
  WHERE id = _owner_id;

  RETURN jsonb_build_object(
    'success', true,
    'agency_id', _new_agency_id,
    'agency_code', _agency_code
  );
END;
$$;
