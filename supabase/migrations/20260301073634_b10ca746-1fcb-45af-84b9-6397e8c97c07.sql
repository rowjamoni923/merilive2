
-- Fix: admin_update_user_gender should sync host status with gender
CREATE OR REPLACE FUNCTION public.admin_update_user_gender(
  _user_id uuid,
  _new_gender text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  
  IF _new_gender NOT IN ('male', 'female', 'other') THEN
    RAISE EXCEPTION 'Invalid gender value';
  END IF;
  
  IF _new_gender = 'female' THEN
    -- Female = Host with full privileges
    UPDATE profiles
    SET gender = 'female',
        is_host = true,
        host_status = 'approved',
        is_face_verified = true,
        updated_at = now()
    WHERE id = _user_id;
  ELSE
    -- Male/Other = User, remove host privileges
    UPDATE profiles
    SET gender = _new_gender,
        is_host = false,
        host_status = null,
        is_face_verified = false,
        updated_at = now()
    WHERE id = _user_id;
  END IF;
  
  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;
  
  PERFORM public.log_admin_action(
    'update_gender',
    'profile',
    _user_id::text,
    jsonb_build_object('new_gender', _new_gender, 'synced_host', _new_gender = 'female')
  );
  
  RETURN TRUE;
END;
$$;
