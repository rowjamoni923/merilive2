
-- Drop old function first to allow parameter rename
DROP FUNCTION IF EXISTS public.admin_process_face_verification(uuid, text, text, text, text);

-- Recreate with correct column references
CREATE OR REPLACE FUNCTION public.admin_process_face_verification(
  _submission_id uuid,
  _action text,
  _reason text DEFAULT NULL,
  _approve_as text DEFAULT 'user',
  _set_gender text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _submission RECORD;
  _gender_value text;
  _face_url text;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'Not authorized'; END IF;
  
  SELECT * INTO _submission FROM face_verification_submissions WHERE id = _submission_id;
  IF NOT FOUND THEN RETURN FALSE; END IF;
  
  _gender_value := COALESCE(_set_gender, CASE WHEN _approve_as = 'host' THEN 'female' ELSE 'male' END);
  _face_url := COALESCE(_submission.face_image_url, _submission.selfie_url);
  
  IF _action = 'approve' THEN
    UPDATE face_verification_submissions 
    SET status = 'approved', verification_type = _approve_as, reviewed_by = auth.uid()::text, 
        reviewed_at = now(), admin_notes = _reason, updated_at = now() 
    WHERE id = _submission_id;
    
    IF _approve_as = 'host' THEN
      UPDATE profiles SET is_verified = true, is_face_verified = true, 
        face_verification_image = _face_url, face_verified_at = now(), 
        is_host = true, host_status = 'approved', gender = _gender_value 
      WHERE id = _submission.user_id;
    ELSE
      UPDATE profiles SET is_verified = true, is_face_verified = true, 
        face_verification_image = _face_url, face_verified_at = now(), 
        gender = _gender_value 
      WHERE id = _submission.user_id;
    END IF;
    
    INSERT INTO notifications (user_id, title, message, type, data) VALUES (
      _submission.user_id, '✅ Face Verification Approved!',
      'Congratulations! Your face verification has been approved as ' || 
        CASE WHEN _approve_as = 'host' THEN 'Host' ELSE 'Verified User' END || '.',
      'face_verification_approved',
      jsonb_build_object('submission_id', _submission_id, 'approved_as', _approve_as, 'gender', _gender_value)
    );
    
  ELSIF _action = 'reject' THEN
    UPDATE face_verification_submissions 
    SET status = 'rejected', reviewed_by = auth.uid()::text, reviewed_at = now(), 
        rejection_reason = _reason, updated_at = now() 
    WHERE id = _submission_id;
    
    UPDATE profiles SET is_face_verified = false, face_verification_image = NULL, face_verified_at = NULL 
    WHERE id = _submission.user_id;
    
    INSERT INTO notifications (user_id, title, message, type, data) VALUES (
      _submission.user_id, '❌ Face Verification Rejected',
      COALESCE('Reason: ' || _reason, 'Please try again with a clear photo.'),
      'face_verification_rejected',
      jsonb_build_object('submission_id', _submission_id, 'rejection_reason', COALESCE(_reason, ''))
    );
  END IF;
  
  PERFORM public.log_admin_action('process_face_verification', 'face_verification', _submission_id::text,
    jsonb_build_object('action', _action, 'approve_as', _approve_as, 'gender', _gender_value, 'user_id', _submission.user_id, 'reason', _reason));
  
  RETURN TRUE;
END;
$$;

-- Fix admin_remove_face_verification
CREATE OR REPLACE FUNCTION public.admin_remove_face_verification(_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  
  UPDATE profiles SET is_verified = false, is_face_verified = false, face_verified_at = null, face_verification_image = null WHERE id = _user_id;
  UPDATE face_verification_submissions SET status = 'removed', updated_at = now() WHERE user_id = _user_id AND status IN ('approved', 'pending');
  
  INSERT INTO notifications (user_id, title, message, type) VALUES (
    _user_id, '🔄 Face Verification Reset', 'Your face verification has been reset. You can now submit a new verification.', 'system'
  );
  
  RETURN true;
END;
$$;

-- Ensure realtime
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'face_verification_submissions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE face_verification_submissions;
  END IF;
END $$;
