
-- Create trigger function to auto-create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_display_name TEXT;
  v_gender TEXT;
  v_device_id TEXT;
BEGIN
  -- Extract metadata
  v_display_name := COALESCE(
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'name',
    split_part(NEW.email, '@', 1),
    'User'
  );
  v_gender := COALESCE(NEW.raw_user_meta_data->>'gender', 'male');
  v_device_id := NEW.raw_user_meta_data->>'device_id';

  -- Insert profile (ignore if exists)
  INSERT INTO public.profiles (id, display_name, gender, device_id, coins, user_level, is_host)
  VALUES (
    NEW.id,
    v_display_name,
    v_gender,
    v_device_id,
    0,
    1,
    false
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

-- Create trigger on auth.users
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();
