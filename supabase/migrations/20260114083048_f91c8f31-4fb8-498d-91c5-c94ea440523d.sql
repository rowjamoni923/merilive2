-- Add unique app_uid column to profiles table
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS app_uid VARCHAR(12) UNIQUE;

-- Create function to generate unique app UID (format: LV + 10 random chars)
CREATE OR REPLACE FUNCTION public.generate_app_uid()
RETURNS VARCHAR(12)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_uid VARCHAR(12);
  uid_exists BOOLEAN;
BEGIN
  LOOP
    -- Generate UID: LV + 10 alphanumeric characters
    new_uid := 'LV' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 10));
    
    -- Check if UID already exists
    SELECT EXISTS(SELECT 1 FROM public.profiles WHERE app_uid = new_uid) INTO uid_exists;
    
    -- Exit loop if UID is unique
    EXIT WHEN NOT uid_exists;
  END LOOP;
  
  RETURN new_uid;
END;
$$;

-- Create trigger function to auto-assign UID on profile creation
CREATE OR REPLACE FUNCTION public.assign_app_uid()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.app_uid IS NULL THEN
    NEW.app_uid := public.generate_app_uid();
  END IF;
  RETURN NEW;
END;
$$;

-- Create trigger for new profiles
DROP TRIGGER IF EXISTS on_profile_created_assign_uid ON public.profiles;
CREATE TRIGGER on_profile_created_assign_uid
  BEFORE INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.assign_app_uid();

-- Generate UIDs for existing profiles that don't have one
UPDATE public.profiles 
SET app_uid = public.generate_app_uid() 
WHERE app_uid IS NULL;

-- Create function to search user by app_uid
CREATE OR REPLACE FUNCTION public.search_user_by_app_uid(_app_uid VARCHAR)
RETURNS TABLE (
  id UUID,
  display_name TEXT,
  username TEXT,
  avatar_url TEXT,
  is_host BOOLEAN,
  is_verified BOOLEAN,
  app_uid VARCHAR
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    p.id,
    p.display_name,
    p.username,
    p.avatar_url,
    p.is_host,
    p.is_verified,
    p.app_uid
  FROM public.profiles p
  WHERE p.app_uid = _app_uid
  LIMIT 1;
$$;