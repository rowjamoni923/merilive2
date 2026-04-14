
-- Fix the trigger to NOT auto-approve hosts
CREATE OR REPLACE FUNCTION public.auto_convert_account_by_gender()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.gender = 'female' THEN
    NEW.is_host := true;
    -- Do NOT auto-approve or auto-verify. Admin must manually approve.
    IF OLD.gender IS DISTINCT FROM 'female' THEN
      NEW.host_status := 'pending';
      -- Keep is_face_verified as-is if already verified, otherwise false
      IF NEW.is_face_verified IS NULL THEN
        NEW.is_face_verified := false;
      END IF;
    END IF;
  ELSIF NEW.gender = 'male' THEN
    NEW.is_host := false;
    NEW.host_status := null;
    NEW.is_face_verified := false;
  END IF;
  RETURN NEW;
END;
$$;

-- Reset hosts who were auto-approved but have NO actual approved face verification
UPDATE profiles p
SET host_status = 'pending', is_face_verified = false
WHERE p.is_host = true
  AND p.host_status = 'approved'
  AND p.is_face_verified = true
  AND NOT EXISTS (
    SELECT 1 FROM face_verification_submissions fvs
    WHERE fvs.user_id = p.id AND fvs.status = 'approved'
  )
  AND NOT EXISTS (
    SELECT 1 FROM host_applications ha
    WHERE ha.user_id = p.id AND ha.status = 'approved'
  );
