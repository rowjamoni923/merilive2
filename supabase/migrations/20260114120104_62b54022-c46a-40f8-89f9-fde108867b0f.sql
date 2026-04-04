-- Update generate_app_uid function to use numbers only (10 digits)
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
    -- Generate UID: 10 random digits (e.g., 1234567890)
    new_uid := lpad(floor(random() * 10000000000)::bigint::text, 10, '0');
    
    -- Check if UID already exists
    SELECT EXISTS(SELECT 1 FROM public.profiles WHERE app_uid = new_uid) INTO uid_exists;
    
    -- Exit loop if UID is unique
    EXIT WHEN NOT uid_exists;
  END LOOP;
  
  RETURN new_uid;
END;
$$;

-- Update existing app_uids to numeric format
UPDATE public.profiles 
SET app_uid = lpad(floor(random() * 10000000000)::bigint::text, 10, '0')
WHERE app_uid IS NOT NULL AND app_uid LIKE 'LV%';