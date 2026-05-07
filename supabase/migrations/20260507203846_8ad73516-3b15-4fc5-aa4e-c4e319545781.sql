ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS birthday date;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS language text;

COMMENT ON COLUMN public.profiles.birthday IS 'Date of birth; age must be >= 18.';
COMMENT ON COLUMN public.profiles.language IS 'Preferred UI language label (e.g. English).';

CREATE OR REPLACE FUNCTION public.update_avatar(p_public_url text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;
  IF p_public_url IS NULL OR length(trim(p_public_url)) < 8 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid avatar URL');
  END IF;
  UPDATE public.profiles
  SET avatar_url = trim(p_public_url), updated_at = now()
  WHERE id = uid;
  RETURN jsonb_build_object('success', true, 'avatar_url', trim(p_public_url));
END;
$$;

CREATE OR REPLACE FUNCTION public.update_profile(p_patch jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  v_old_gender text;
  v_display text;
  v_bio text;
  v_cc text;
  v_cn text;
  v_cf text;
  v_hide boolean;
  v_lang text;
  v_birth date;
  v_age int;
  v_gender text;
BEGIN
  IF uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  IF p_patch IS NULL OR jsonb_typeof(p_patch) <> 'object' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid payload');
  END IF;

  SELECT lower(trim(gender)) INTO v_old_gender FROM public.profiles WHERE id = uid;

  IF p_patch ? 'display_name' THEN
    v_display := trim(p_patch->>'display_name');
    IF char_length(v_display) < 2 OR char_length(v_display) > 24 THEN
      RETURN jsonb_build_object('success', false, 'error', 'Display name must be 2–24 characters');
    END IF;
  END IF;

  IF p_patch ? 'bio' THEN
    v_bio := trim(p_patch->>'bio');
    IF char_length(v_bio) > 200 THEN
      RETURN jsonb_build_object('success', false, 'error', 'Bio must be at most 200 characters');
    END IF;
  END IF;

  IF p_patch ? 'country_code' THEN
    v_cc := nullif(trim(p_patch->>'country_code'), '');
    IF v_cc IS NOT NULL AND char_length(v_cc) > 2 THEN
      v_cc := left(v_cc, 2);
    END IF;
  END IF;
  IF p_patch ? 'country_name' THEN
    v_cn := nullif(trim(p_patch->>'country_name'), '');
  END IF;
  IF p_patch ? 'country_flag' THEN
    v_cf := nullif(trim(p_patch->>'country_flag'), '');
  END IF;
  IF p_patch ? 'hide_location' THEN
    v_hide := (p_patch->>'hide_location')::boolean;
  END IF;
  IF p_patch ? 'language' THEN
    v_lang := nullif(trim(p_patch->>'language'), '');
  END IF;

  v_age := NULL;

  IF p_patch ? 'birthday' THEN
    IF p_patch->'birthday' IS NULL OR jsonb_typeof(p_patch->'birthday') = 'null' OR (trim(coalesce(p_patch->>'birthday','')) = '') THEN
      v_birth := NULL;
      v_age := NULL;
    ELSE
      BEGIN
        v_birth := (p_patch->>'birthday')::date;
      EXCEPTION WHEN others THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid birthday');
      END;
      IF v_birth IS NOT NULL AND v_birth > (CURRENT_DATE - interval '18 years')::date THEN
        RETURN jsonb_build_object('success', false, 'error', 'You must be at least 18');
      END IF;
      IF v_birth IS NOT NULL THEN
        v_age := EXTRACT(YEAR FROM age(v_birth))::int;
        IF v_age > 100 THEN
          RETURN jsonb_build_object('success', false, 'error', 'Invalid birthday');
        END IF;
      END IF;
    END IF;
  END IF;

  IF p_patch ? 'age' AND NOT (p_patch ? 'birthday') THEN
    IF p_patch->>'age' IS NULL OR trim(p_patch->>'age') = '' THEN
      v_age := NULL;
    ELSE
      BEGIN
        v_age := (p_patch->>'age')::int;
      EXCEPTION WHEN others THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid age');
      END;
      IF v_age IS NOT NULL AND (v_age < 18 OR v_age > 100) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Age must be 18–100');
      END IF;
    END IF;
  END IF;

  IF p_patch ? 'gender' THEN
    v_gender := lower(trim(p_patch->>'gender'));
    IF v_gender IS NOT NULL AND v_gender NOT IN ('male', 'female', 'other', 'prefer_not_to_say') THEN
      RETURN jsonb_build_object('success', false, 'error', 'Invalid gender');
    END IF;
    IF v_old_gender IN ('male', 'female') AND v_gender IS DISTINCT FROM v_old_gender THEN
      RETURN jsonb_build_object('success', false, 'error', 'Gender is locked');
    END IF;
  END IF;

  UPDATE public.profiles SET
    display_name = CASE WHEN p_patch ? 'display_name' THEN v_display ELSE display_name END,
    bio = CASE WHEN p_patch ? 'bio' THEN v_bio ELSE bio END,
    country_code = CASE WHEN p_patch ? 'country_code' THEN COALESCE(v_cc, country_code) ELSE country_code END,
    country_name = CASE WHEN p_patch ? 'country_name' THEN COALESCE(v_cn, country_name) ELSE country_name END,
    country_flag = CASE WHEN p_patch ? 'country_flag' THEN COALESCE(v_cf, country_flag) ELSE country_flag END,
    hide_location = CASE WHEN p_patch ? 'hide_location' THEN v_hide ELSE hide_location END,
    language = CASE WHEN p_patch ? 'language' THEN COALESCE(v_lang, language) ELSE language END,
    birthday = CASE WHEN p_patch ? 'birthday' THEN v_birth ELSE birthday END,
    age = CASE
      WHEN p_patch ? 'birthday' THEN v_age
      WHEN p_patch ? 'age' THEN v_age
      ELSE age
    END,
    gender = CASE WHEN p_patch ? 'gender' THEN COALESCE(v_gender, gender) ELSE gender END,
    updated_at = now()
  WHERE id = uid;

  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE ALL ON FUNCTION public.update_avatar(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_profile(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_avatar(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_profile(jsonb) TO authenticated;