-- Add account deletion fields to profiles table
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS deletion_requested_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
ADD COLUMN IF NOT EXISTS deletion_scheduled_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS face_hash TEXT DEFAULT NULL;

-- Create face verification records table for face matching
CREATE TABLE IF NOT EXISTS public.face_records (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  face_embedding TEXT NOT NULL,
  face_image_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  is_active BOOLEAN DEFAULT TRUE,
  UNIQUE(user_id)
);

-- Enable RLS
ALTER TABLE public.face_records ENABLE ROW LEVEL SECURITY;

-- Create policies for face_records
CREATE POLICY "Users can view their own face record" 
ON public.face_records 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own face record" 
ON public.face_records 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own face record" 
ON public.face_records 
FOR UPDATE 
USING (auth.uid() = user_id);

-- Create index for faster face lookup
CREATE INDEX IF NOT EXISTS idx_face_records_embedding ON public.face_records(face_embedding);
CREATE INDEX IF NOT EXISTS idx_profiles_deletion ON public.profiles(deletion_scheduled_at) WHERE deletion_scheduled_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_profiles_face_hash ON public.profiles(face_hash) WHERE face_hash IS NOT NULL;

-- Function to cancel account deletion
CREATE OR REPLACE FUNCTION public.cancel_account_deletion(user_id_param UUID)
RETURNS BOOLEAN AS $$
BEGIN
  UPDATE public.profiles
  SET 
    deletion_requested_at = NULL,
    deletion_scheduled_at = NULL
  WHERE id = user_id_param;
  
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to request account deletion (15 days)
CREATE OR REPLACE FUNCTION public.request_account_deletion(user_id_param UUID)
RETURNS TIMESTAMP WITH TIME ZONE AS $$
DECLARE
  scheduled_date TIMESTAMP WITH TIME ZONE;
BEGIN
  scheduled_date := now() + INTERVAL '15 days';
  
  UPDATE public.profiles
  SET 
    deletion_requested_at = now(),
    deletion_scheduled_at = scheduled_date
  WHERE id = user_id_param;
  
  RETURN scheduled_date;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to find existing account by face hash
CREATE OR REPLACE FUNCTION public.find_account_by_face(face_hash_param TEXT)
RETURNS TABLE(
  user_id UUID,
  display_name TEXT,
  avatar_url TEXT,
  is_deleted BOOLEAN,
  deletion_scheduled_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p.id as user_id,
    p.display_name,
    p.avatar_url,
    p.is_deleted,
    p.deletion_scheduled_at
  FROM public.profiles p
  WHERE p.face_hash = face_hash_param
  AND p.is_host = TRUE
  LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;