
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  _app_uid TEXT;
  _display_name TEXT;
BEGIN
  _app_uid := 'U' || LPAD(FLOOR(RANDOM() * 99999999)::TEXT, 8, '0');
  
  _display_name := COALESCE(
    NEW.raw_user_meta_data->>'display_name',
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'name',
    'User'
  );

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
    NEW.raw_user_meta_data->>'device_id',
    NEW.raw_user_meta_data->>'gender',
    now(), now()
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
