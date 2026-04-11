
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  _app_uid TEXT;
  _display_name TEXT;
  _device_id TEXT;
BEGIN
  _app_uid := 'U' || LPAD(FLOOR(RANDOM() * 99999999)::TEXT, 8, '0');
  _device_id := NEW.raw_user_meta_data->>'device_id';
  
  _display_name := COALESCE(
    NEW.raw_user_meta_data->>'display_name',
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'name',
    'User'
  );

  -- If device_id provided and profile already exists for it, update the existing profile's id
  IF _device_id IS NOT NULL THEN
    UPDATE public.profiles
    SET id = NEW.id,
        email = NEW.email,
        updated_at = now()
    WHERE device_id = _device_id
      AND id != NEW.id
      AND is_deleted = false;
    
    IF FOUND THEN
      RETURN NEW;
    END IF;
  END IF;

  -- Otherwise create a new profile
  BEGIN
    INSERT INTO public.profiles (
      id, app_uid, display_name, email, avatar_url,
      coins, diamonds, beans, beans_balance,
      user_level, host_level, is_verified, is_online,
      device_id, gender,
      created_at, updated_at
    ) VALUES (
      NEW.id, _app_uid, _display_name, NEW.email,
      COALESCE(NEW.raw_user_meta_data->>'avatar_url', ''),
      0, 0, 0, 0,
      1, 0, false, false,
      _device_id,
      NEW.raw_user_meta_data->>'gender',
      now(), now()
    )
    ON CONFLICT (id) DO NOTHING;
  EXCEPTION WHEN unique_violation THEN
    -- Profile with this device_id already exists, just update it
    UPDATE public.profiles
    SET email = COALESCE(NEW.email, email),
        updated_at = now()
    WHERE device_id = _device_id;
  END;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
