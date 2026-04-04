
-- Add duplicate face detection columns to face_verification_submissions
ALTER TABLE public.face_verification_submissions 
ADD COLUMN IF NOT EXISTS duplicate_face_user_id UUID REFERENCES public.profiles(id),
ADD COLUMN IF NOT EXISTS duplicate_face_name TEXT,
ADD COLUMN IF NOT EXISTS duplicate_face_uid TEXT,
ADD COLUMN IF NOT EXISTS duplicate_face_avatar TEXT,
ADD COLUMN IF NOT EXISTS is_duplicate_face BOOLEAN DEFAULT false;

-- Add index for quick duplicate lookup
CREATE INDEX IF NOT EXISTS idx_face_verification_duplicate ON public.face_verification_submissions(is_duplicate_face) WHERE is_duplicate_face = true;
