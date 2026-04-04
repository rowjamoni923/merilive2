
-- Fix: auto_convert_account_by_gender should fully sync host status, not just is_host
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
    NEW.host_status := 'approved';
    NEW.is_face_verified := true;
  -- If gender is set to 'male', revert to user account
  ELSIF NEW.gender = 'male' THEN
    NEW.is_host := false;
    NEW.host_status := null;
    NEW.is_face_verified := false;
  END IF;
  
  RETURN NEW;
END;
$$;
