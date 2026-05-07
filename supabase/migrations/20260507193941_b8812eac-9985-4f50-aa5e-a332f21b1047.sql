ALTER TABLE public.agencies
  ADD COLUMN IF NOT EXISTS registration_meta jsonb DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.agencies.registration_meta IS 'Agency signup extras: country, description, payment methods (Section 13).';

CREATE TABLE IF NOT EXISTS public.agency_faqs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question text NOT NULL,
  answer text NOT NULL,
  display_order integer DEFAULT 0 NOT NULL,
  is_active boolean DEFAULT true NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_agency_faqs_active_order ON public.agency_faqs (is_active, display_order);

ALTER TABLE public.agency_faqs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read active agency faqs" ON public.agency_faqs;
CREATE POLICY "Anyone can read active agency faqs" ON public.agency_faqs
  FOR SELECT TO anon, authenticated
  USING (COALESCE(is_active, false) = true);

GRANT SELECT ON public.agency_faqs TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.create_agency_with_owner(
  p_agency_name text,
  p_agency_code text,
  p_country text DEFAULT NULL,
  p_description text DEFAULT NULL,
  p_owner_phone text DEFAULT NULL,
  p_payment jsonb DEFAULT '{}'::jsonb,
  p_level text DEFAULT 'A1'::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _owner_id uuid := auth.uid();
  _gender text;
  _new_agency_id uuid;
  _code text;
  _name text;
  _tier record;
  _profile record;
  _meta jsonb;
  _auth_email text;
BEGIN
  IF _owner_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  _name := trim(p_agency_name);
  _code := upper(trim(p_agency_code));
  IF _name = '' OR length(_name) < 2 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Agency name is required');
  END IF;
  IF _code = '' OR length(_code) < 3 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Agency code is required');
  END IF;

  SELECT lower(trim(COALESCE(gender::text, ''))) INTO _gender
  FROM public.profiles WHERE id = _owner_id;
  IF _gender IS DISTINCT FROM 'male' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only male users can create an agency');
  END IF;

  SELECT * INTO _tier FROM public.agency_level_tiers
  WHERE level_code = p_level AND COALESCE(is_active, true) = true
  LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid agency level');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.agencies WHERE lower(trim(name)) = lower(trim(_name))
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Agency name already in use');
  END IF;

  IF EXISTS (SELECT 1 FROM public.agencies WHERE agency_code = _code) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Agency code already exists');
  END IF;

  SELECT id, agency_id, is_agency_owner INTO _profile FROM public.profiles WHERE id = _owner_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'User profile not found');
  END IF;
  IF COALESCE(_profile.is_agency_owner, false) THEN
    RETURN jsonb_build_object('success', false, 'error', 'User already owns an agency');
  END IF;
  IF _profile.agency_id IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'User is already linked to an agency');
  END IF;

  BEGIN
    SELECT email INTO STRICT _auth_email FROM auth.users WHERE id = _owner_id;
  EXCEPTION WHEN OTHERS THEN
    _auth_email := NULL;
  END;

  _meta := jsonb_strip_nulls(jsonb_build_object(
    'country', NULLIF(trim(p_country), ''),
    'description', NULLIF(trim(p_description), ''),
    'payment', COALESCE(p_payment, '{}'::jsonb),
    'owner_phone', NULLIF(trim(p_owner_phone), ''),
    'auth_email', _auth_email
  ));

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
    is_active,
    registration_meta
  ) VALUES (
    _name,
    _code,
    _owner_id,
    p_level,
    _tier.commission_rate,
    _auth_email,
    NULLIF(trim(p_owner_phone), ''),
    0,
    0,
    0,
    0,
    0,
    true,
    _meta
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
    'agency_code', _code,
    'commission_rate', _tier.commission_rate
  );
EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object('success', false, 'error', 'Duplicate agency name or code');
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', COALESCE(SQLERRM, 'Failed to create agency'));
END;
$$;

REVOKE ALL ON FUNCTION public.create_agency_with_owner(text, text, text, text, text, jsonb, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_agency_with_owner(text, text, text, text, text, jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_agency_with_owner(text, text, text, text, text, jsonb, text) TO service_role;