DROP TRIGGER IF EXISTS trg_sync_agency_owner_profile ON public.agencies;
DROP FUNCTION IF EXISTS public.sync_agency_owner_profile();
DROP FUNCTION IF EXISTS public.create_agency_for_user(uuid, text, text, text, numeric, text, text);

CREATE OR REPLACE FUNCTION public.create_agency_for_user(
  _owner_id uuid,
  _name text,
  _agency_code text,
  _level text DEFAULT 'A1',
  _commission_rate numeric DEFAULT 3,
  _email text DEFAULT NULL,
  _whatsapp text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _new_agency_id uuid;
  _profile record;
BEGIN
  SELECT id, agency_id, is_agency_owner
  INTO _profile
  FROM public.profiles
  WHERE id = _owner_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'User profile not found');
  END IF;

  IF COALESCE(_profile.is_agency_owner, false) THEN
    RETURN jsonb_build_object('success', false, 'error', 'User already owns an agency');
  END IF;

  IF _profile.agency_id IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'User is already part of an agency');
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.agencies
    WHERE agency_code = _agency_code
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Agency code already exists');
  END IF;

  INSERT INTO public.agencies (
    name,
    agency_code,
    owner_id,
    level,
    commission_rate,
    email,
    whatsapp_number,
    wallet_balance,
    diamond_balance,
    beans_balance,
    total_hosts,
    total_agents,
    is_active
  ) VALUES (
    _name,
    _agency_code,
    _owner_id,
    _level,
    _commission_rate,
    _email,
    _whatsapp,
    0,
    0,
    0,
    0,
    0,
    true
  )
  RETURNING id INTO _new_agency_id;

  PERFORM set_config('app.bypass_profile_protection', 'true', true);

  UPDATE public.profiles
  SET is_agency_owner = true,
      agency_id = _new_agency_id
  WHERE id = _owner_id;

  RETURN jsonb_build_object(
    'success', true,
    'agency_id', _new_agency_id,
    'agency_code', _agency_code
  );
EXCEPTION
  WHEN others THEN
    RETURN jsonb_build_object('success', false, 'error', COALESCE(SQLERRM, 'Failed to create agency'));
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_agency_for_user(uuid, text, text, text, numeric, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_agency_for_user(uuid, text, text, text, numeric, text, text) TO service_role;

CREATE OR REPLACE FUNCTION public.sync_agency_owner_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.owner_id IS NULL THEN
    RETURN NEW;
  END IF;

  PERFORM set_config('app.bypass_profile_protection', 'true', true);

  UPDATE public.profiles
  SET agency_id = NEW.id,
      is_agency_owner = true
  WHERE id = NEW.owner_id
    AND (
      agency_id IS DISTINCT FROM NEW.id
      OR COALESCE(is_agency_owner, false) IS DISTINCT FROM true
    );

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_sync_agency_owner_profile
AFTER INSERT OR UPDATE OF owner_id ON public.agencies
FOR EACH ROW
WHEN (NEW.owner_id IS NOT NULL)
EXECUTE FUNCTION public.sync_agency_owner_profile();