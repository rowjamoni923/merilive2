-- Add tags column to profiles table (array of selected tags)
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';

-- Create poster_images table for storing multiple profile photos
CREATE TABLE IF NOT EXISTS public.poster_images (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  is_primary BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on poster_images
ALTER TABLE public.poster_images ENABLE ROW LEVEL SECURITY;

-- Policies for poster_images
CREATE POLICY "Users can view any poster images" 
  ON public.poster_images FOR SELECT 
  USING (true);

CREATE POLICY "Users can insert their own poster images" 
  ON public.poster_images FOR INSERT 
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own poster images" 
  ON public.poster_images FOR UPDATE 
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own poster images" 
  ON public.poster_images FOR DELETE 
  USING (auth.uid() = user_id);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_poster_images_user_id ON public.poster_images(user_id);

-- Create storage bucket for poster images if not exists
INSERT INTO storage.buckets (id, name, public)
VALUES ('posters', 'posters', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for posters bucket
CREATE POLICY "Poster images are publicly accessible"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'posters');

CREATE POLICY "Users can upload their own posters"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'posters' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can update their own posters"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'posters' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete their own posters"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'posters' AND auth.uid()::text = (storage.foldername(name))[1]);