-- Add face verification columns to profiles table
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS is_face_verified boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS face_verification_image text,
ADD COLUMN IF NOT EXISTS face_verified_at timestamp with time zone;

-- Create storage bucket for face verification if it doesn't exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('face-verification', 'face-verification', true)
ON CONFLICT (id) DO NOTHING;

-- Create storage policies for face verification bucket
CREATE POLICY "Users can view their own face verification files"
ON storage.objects FOR SELECT
USING (bucket_id = 'face-verification' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can upload their own face verification files"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'face-verification' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can update their own face verification files"
ON storage.objects FOR UPDATE
USING (bucket_id = 'face-verification' AND auth.uid()::text = (storage.foldername(name))[1]);