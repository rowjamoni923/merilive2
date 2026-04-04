-- Fix trigger to handle both uppercase and lowercase gender values
CREATE OR REPLACE FUNCTION public.auto_convert_account_by_gender()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- If gender is set to 'female' (case insensitive), automatically convert to host account
  IF LOWER(NEW.gender) = 'female' THEN
    NEW.is_host := true;
  -- If gender is set to 'male' (case insensitive), keep as user account
  ELSIF LOWER(NEW.gender) = 'male' THEN
    NEW.is_host := false;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Update all existing Female users to be hosts (both cases)
UPDATE public.profiles 
SET is_host = true 
WHERE LOWER(gender) = 'female' AND (is_host = false OR is_host IS NULL);

-- Update all existing Male users to be regular users (both cases)
UPDATE public.profiles 
SET is_host = false 
WHERE LOWER(gender) = 'male' AND is_host = true;