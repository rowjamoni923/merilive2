CREATE OR REPLACE FUNCTION public.ensure_profile_row_from_auth(
  _user_id uuid,
  _email text DEFAULT NULL,
  _raw_user_meta_data jsonb DEFAULT '{}'::jsonb
)
RETURNS public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _profile public.profiles%ROWTYPE;
  _display_name text;
  _username text;
  _avatar_url text;
  _gender text;
  _device_id text;
  _app_uid text;
  _is_verified boolean;
  _is_host boolean;
  _host_status text;
BEGIN
  SELECT *
  INTO _profile
  FROM public.profiles
  WHERE id = _user_id;

  IF FOUND THEN
    RETURN _profile;
  END IF;

  _display_name := NULLIF(BTRIM(COALESCE(
    _raw_user_meta_data ->> 'full_name',
    _raw_user_meta_data ->> 'name',
    CASE
      WHEN _email IS NOT NULL AND _email !~ '@meri\\.local$' THEN split_part(_email, '@', 1)
      ELSE NULL
    END
  )), '');

  IF _display_name IS NULL THEN
    _display_name := 'User' || substr(replace(_user_id::text, '-', ''), 1, 6);
  END IF;

  _username := CASE
    WHEN _email IS NOT NULL AND _email !~ '@meri\\.local$' THEN NULLIF(BTRIM(split_part(_email, '@', 1)), '')
    ELSE NULL
  END;

  _avatar_url := NULLIF(COALESCE(
    _raw_user_meta_data ->> 'avatar_url',
    _raw_user_meta_data ->> 'picture'
  ), '');

  _gender := lower(NULLIF(BTRIM(_raw_user_meta_data ->> 'gender'), ''));
  IF _gender NOT IN ('male', 'female') THEN
    _gender := NULL;
  END IF;

  _device_id := NULLIF(BTRIM(_raw_user_meta_data ->> 'device_id'), '');
  _app_uid := NULLIF(BTRIM(_raw_user_meta_data ->> 'app_uid'), '');
  _is_verified := COALESCE((_raw_user_meta_data ->> 'email_verified')::boolean, false);
  _is_host := (_gender = 'female');
  _host_status := CASE WHEN _gender = 'female' THEN 'pending' ELSE NULL END;

  INSERT INTO public.profiles (
    id,
    username,
    display_name,
    avatar_url,
    gender,
    app_uid,
    device_id,
    email,
    is_verified,
    is_host,
    host_status,
    is_face_verified,
    last_seen_at
  )
  VALUES (
    _user_id,
    _username,
    _display_name,
    _avatar_url,
    _gender,
    _app_uid,
    _device_id,
    _email,
    _is_verified,
    _is_host,
    _host_status,
    false,
    now()
  )
  ON CONFLICT (id) DO NOTHING;

  SELECT *
  INTO _profile
  FROM public.profiles
  WHERE id = _user_id;

  RETURN _profile;
END;
$$;

INSERT INTO public.profiles (
  id,
  username,
  display_name,
  avatar_url,
  gender,
  app_uid,
  device_id,
  email,
  is_verified,
  is_host,
  host_status,
  is_face_verified,
  last_seen_at
)
SELECT
  au.id,
  CASE
    WHEN au.email IS NOT NULL AND au.email !~ '@meri\\.local$' THEN NULLIF(BTRIM(split_part(au.email, '@', 1)), '')
    ELSE NULL
  END AS username,
  COALESCE(
    NULLIF(BTRIM(COALESCE(au.raw_user_meta_data ->> 'full_name', au.raw_user_meta_data ->> 'name')), ''),
    CASE
      WHEN au.email IS NOT NULL AND au.email !~ '@meri\\.local$' THEN NULLIF(BTRIM(split_part(au.email, '@', 1)), '')
      ELSE NULL
    END,
    'User' || substr(replace(au.id::text, '-', ''), 1, 6)
  ) AS display_name,
  NULLIF(COALESCE(au.raw_user_meta_data ->> 'avatar_url', au.raw_user_meta_data ->> 'picture'), '') AS avatar_url,
  CASE
    WHEN lower(NULLIF(BTRIM(au.raw_user_meta_data ->> 'gender'), '')) IN ('male', 'female')
      THEN lower(NULLIF(BTRIM(au.raw_user_meta_data ->> 'gender'), ''))
    ELSE NULL
  END AS gender,
  NULLIF(BTRIM(au.raw_user_meta_data ->> 'app_uid'), '') AS app_uid,
  NULLIF(BTRIM(au.raw_user_meta_data ->> 'device_id'), '') AS device_id,
  au.email,
  COALESCE((au.raw_user_meta_data ->> 'email_verified')::boolean, false) AS is_verified,
  CASE
    WHEN lower(NULLIF(BTRIM(au.raw_user_meta_data ->> 'gender'), '')) = 'female' THEN true
    ELSE false
  END AS is_host,
  CASE
    WHEN lower(NULLIF(BTRIM(au.raw_user_meta_data ->> 'gender'), '')) = 'female' THEN 'pending'
    ELSE NULL
  END AS host_status,
  false AS is_face_verified,
  now() AS last_seen_at
FROM auth.users au
LEFT JOIN public.profiles p ON p.id = au.id
WHERE p.id IS NULL;