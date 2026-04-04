-- Create host_applications table for verification requests
CREATE TABLE public.host_applications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  
  -- Step 1: Basic Info
  full_name TEXT NOT NULL,
  age INTEGER NOT NULL CHECK (age >= 18),
  language TEXT NOT NULL,
  photo_url TEXT NOT NULL,
  
  -- Step 2: Video
  video_url TEXT,
  video_duration_seconds INTEGER,
  
  -- Step 3: Face Verification
  face_verification_image_url TEXT,
  face_verification_status TEXT DEFAULT 'pending' CHECK (face_verification_status IN ('pending', 'passed', 'failed')),
  face_match_score DECIMAL(5,2),
  
  -- Application Status
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'under_review', 'approved', 'rejected')),
  rejection_reason TEXT,
  reviewed_by UUID REFERENCES auth.users(id),
  reviewed_at TIMESTAMP WITH TIME ZONE,
  admin_notes TEXT,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  submitted_at TIMESTAMP WITH TIME ZONE,
  
  -- Current step tracking
  current_step INTEGER NOT NULL DEFAULT 1 CHECK (current_step >= 1 AND current_step <= 3),
  is_complete BOOLEAN NOT NULL DEFAULT false,
  
  CONSTRAINT unique_user_application UNIQUE (user_id)
);

-- Enable RLS
ALTER TABLE public.host_applications ENABLE ROW LEVEL SECURITY;

-- Users can view and update their own application
CREATE POLICY "Users can view their own application"
  ON public.host_applications
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own application"
  ON public.host_applications
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own application"
  ON public.host_applications
  FOR UPDATE
  USING (auth.uid() = user_id AND status = 'pending');

-- Admins can view and manage all applications
CREATE POLICY "Admins can view all applications"
  ON public.host_applications
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles 
      WHERE user_id = auth.uid() 
      AND role IN ('admin', 'moderator')
    )
  );

CREATE POLICY "Admins can update all applications"
  ON public.host_applications
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles 
      WHERE user_id = auth.uid() 
      AND role IN ('admin', 'moderator')
    )
  );

-- Create trigger for updated_at
CREATE TRIGGER update_host_applications_updated_at
  BEFORE UPDATE ON public.host_applications
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create storage bucket for host verification files
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'host-verification',
  'host-verification',
  true,
  52428800, -- 50MB limit
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm', 'video/quicktime']
);

-- Storage policies for host verification bucket
CREATE POLICY "Users can upload their own verification files"
  ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'host-verification' 
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Verification files are publicly accessible"
  ON storage.objects
  FOR SELECT
  USING (bucket_id = 'host-verification');

CREATE POLICY "Users can update their own verification files"
  ON storage.objects
  FOR UPDATE
  USING (
    bucket_id = 'host-verification' 
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can delete their own verification files"
  ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'host-verification' 
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Create index for faster queries
CREATE INDEX idx_host_applications_status ON public.host_applications(status);
CREATE INDEX idx_host_applications_user_id ON public.host_applications(user_id);
CREATE INDEX idx_host_applications_created_at ON public.host_applications(created_at DESC);