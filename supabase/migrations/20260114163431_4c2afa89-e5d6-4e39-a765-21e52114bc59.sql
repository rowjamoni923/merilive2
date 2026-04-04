-- Create face verification submissions table
CREATE TABLE public.face_verification_submissions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  verification_type TEXT NOT NULL DEFAULT 'user', -- 'user' or 'host'
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'approved', 'rejected'
  
  -- Basic Info (for hosts)
  full_name TEXT,
  age INTEGER,
  language TEXT,
  profile_photo_url TEXT,
  
  -- Video & Photos (for hosts)
  video_url TEXT,
  host_photos TEXT[], -- Array of photo URLs
  
  -- Face Verification (for all)
  face_image_url TEXT,
  face_verified_at TIMESTAMP WITH TIME ZONE,
  
  -- Review Info
  reviewed_by UUID REFERENCES auth.users(id),
  reviewed_at TIMESTAMP WITH TIME ZONE,
  rejection_reason TEXT,
  admin_notes TEXT,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.face_verification_submissions ENABLE ROW LEVEL SECURITY;

-- Users can view their own submissions
CREATE POLICY "Users can view their own submissions"
ON public.face_verification_submissions
FOR SELECT
USING (auth.uid() = user_id);

-- Users can create their own submissions
CREATE POLICY "Users can create their own submissions"
ON public.face_verification_submissions
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Users can update their pending submissions
CREATE POLICY "Users can update their pending submissions"
ON public.face_verification_submissions
FOR UPDATE
USING (auth.uid() = user_id AND status = 'pending');

-- Admins can view all submissions
CREATE POLICY "Admins can view all submissions"
ON public.face_verification_submissions
FOR SELECT
USING (public.is_admin(auth.uid()));

-- Admins can update all submissions
CREATE POLICY "Admins can update all submissions"
ON public.face_verification_submissions
FOR UPDATE
USING (public.is_admin(auth.uid()));

-- Create function to process face verification
CREATE OR REPLACE FUNCTION public.admin_process_face_verification(
  _submission_id UUID,
  _action TEXT,
  _reason TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _submission RECORD;
BEGIN
  -- Check if caller is admin
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  
  -- Get submission
  SELECT * INTO _submission
  FROM face_verification_submissions
  WHERE id = _submission_id;
  
  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;
  
  IF _action = 'approve' THEN
    -- Update submission status
    UPDATE face_verification_submissions
    SET 
      status = 'approved',
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      admin_notes = _reason,
      updated_at = now()
    WHERE id = _submission_id;
    
    -- Update user profile
    UPDATE profiles
    SET 
      is_face_verified = true,
      face_verification_image = _submission.face_image_url,
      face_verified_at = now()
    WHERE id = _submission.user_id;
    
  ELSIF _action = 'reject' THEN
    -- Update submission status
    UPDATE face_verification_submissions
    SET 
      status = 'rejected',
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      rejection_reason = _reason,
      updated_at = now()
    WHERE id = _submission_id;
    
    -- Ensure user is not verified
    UPDATE profiles
    SET 
      is_face_verified = false,
      face_verification_image = NULL,
      face_verified_at = NULL
    WHERE id = _submission.user_id;
  END IF;
  
  -- Log admin action
  PERFORM public.log_admin_action(
    'process_face_verification',
    'face_verification',
    _submission_id,
    jsonb_build_object(
      'action', _action,
      'user_id', _submission.user_id,
      'verification_type', _submission.verification_type,
      'reason', _reason
    )
  );
  
  RETURN TRUE;
END;
$$;

-- Create trigger for updated_at
CREATE TRIGGER update_face_verification_submissions_updated_at
BEFORE UPDATE ON public.face_verification_submissions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();