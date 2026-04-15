-- Fix: Remove auto-approve for hosts. Only admin can approve.
-- Update the trigger to set host_status = 'pending' instead of 'approved'

CREATE OR REPLACE FUNCTION public.auto_convert_account_by_gender() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NEW.gender = 'female' THEN
    NEW.is_host := true;
    NEW.host_status := 'pending';
    -- Do NOT auto set is_face_verified = true
  ELSIF NEW.gender = 'male' THEN
    NEW.is_host := false;
    NEW.host_status := null;
    NEW.is_face_verified := false;
  END IF;
  RETURN NEW;
END;
$$;