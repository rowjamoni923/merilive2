CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _name TEXT;
BEGIN
  _name := COALESCE(
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'display_name',
    NEW.raw_user_meta_data->>'name'
  );

  INSERT INTO public.profiles (id, display_name)
  VALUES (NEW.id, _name)
  ON CONFLICT (id) DO UPDATE SET
    display_name = COALESCE(
      NULLIF(EXCLUDED.display_name, ''),
      profiles.display_name
    );
  RETURN NEW;
END;
$$;