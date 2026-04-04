-- Create trigger function to auto-convert account based on gender
CREATE OR REPLACE FUNCTION public.auto_convert_account_by_gender()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- If gender is set to 'female', automatically convert to host account
  IF NEW.gender = 'female' THEN
    NEW.is_host := true;
  -- If gender is set to 'male', keep as user account
  ELSIF NEW.gender = 'male' THEN
    NEW.is_host := false;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Drop existing trigger if exists
DROP TRIGGER IF EXISTS trigger_auto_convert_account_by_gender ON public.profiles;

-- Create trigger that fires before INSERT or UPDATE on profiles
CREATE TRIGGER trigger_auto_convert_account_by_gender
  BEFORE INSERT OR UPDATE OF gender ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_convert_account_by_gender();

-- Update all existing female users to be hosts
UPDATE public.profiles 
SET is_host = true 
WHERE gender = 'female' AND (is_host = false OR is_host IS NULL);

-- Update all existing male users to be regular users
UPDATE public.profiles 
SET is_host = false 
WHERE gender = 'male' AND is_host = true;