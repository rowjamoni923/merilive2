-- Create function to generate unique 8-digit numeric app_uid
CREATE OR REPLACE FUNCTION public.generate_unique_app_uid()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_uid TEXT;
  uid_exists BOOLEAN;
BEGIN
  LOOP
    -- Generate random 8-digit number (10000000 to 99999999)
    new_uid := LPAD(FLOOR(RANDOM() * 90000000 + 10000000)::TEXT, 8, '0');
    
    -- Check if it already exists
    SELECT EXISTS(SELECT 1 FROM profiles WHERE app_uid = new_uid) INTO uid_exists;
    
    -- Exit loop if unique
    IF NOT uid_exists THEN
      EXIT;
    END IF;
  END LOOP;
  
  RETURN new_uid;
END;
$$;

-- Create function to auto-set app_uid on profile creation
CREATE OR REPLACE FUNCTION public.set_app_uid_on_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only set if app_uid is null or empty
  IF NEW.app_uid IS NULL OR NEW.app_uid = '' THEN
    NEW.app_uid := public.generate_unique_app_uid();
  END IF;
  RETURN NEW;
END;
$$;

-- Drop existing trigger if any
DROP TRIGGER IF EXISTS set_app_uid_trigger ON profiles;

-- Create trigger to auto-generate app_uid
CREATE TRIGGER set_app_uid_trigger
  BEFORE INSERT ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.set_app_uid_on_insert();

-- Update existing users without app_uid to have 8-digit numeric IDs
UPDATE profiles 
SET app_uid = public.generate_unique_app_uid()
WHERE app_uid IS NULL OR app_uid = '' OR LENGTH(app_uid) != 8 OR app_uid !~ '^[0-9]{8}$';

-- Create or replace search function for app_uid
CREATE OR REPLACE FUNCTION public.search_user_by_app_uid(_app_uid TEXT)
RETURNS TABLE(id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT p.id
  FROM profiles p
  WHERE p.app_uid = _app_uid
  OR p.app_uid LIKE _app_uid || '%';
END;
$$;