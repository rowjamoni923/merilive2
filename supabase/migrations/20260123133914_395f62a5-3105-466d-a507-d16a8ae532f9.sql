-- Create admin sounds table for pre-uploaded music
CREATE TABLE IF NOT EXISTS public.admin_music_library (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  artist TEXT NOT NULL,
  audio_url TEXT NOT NULL,
  cover_image_url TEXT,
  duration_seconds INTEGER DEFAULT 0,
  genre TEXT,
  category TEXT DEFAULT 'music',
  is_active BOOLEAN DEFAULT true,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS for admin music
ALTER TABLE public.admin_music_library ENABLE ROW LEVEL SECURITY;

-- Everyone can view admin music
CREATE POLICY "Anyone can view admin music"
ON public.admin_music_library
FOR SELECT
USING (is_active = true);

-- Admins manage via service role key (no RLS check for authenticated users)
CREATE POLICY "Admins insert music"
ON public.admin_music_library
FOR INSERT
WITH CHECK (true);

CREATE POLICY "Admins update music"
ON public.admin_music_library
FOR UPDATE
USING (true);

CREATE POLICY "Admins delete music"
ON public.admin_music_library
FOR DELETE
USING (true);

-- Add sound columns to reels table
ALTER TABLE public.reels ADD COLUMN IF NOT EXISTS sound_id UUID;
ALTER TABLE public.reels ADD COLUMN IF NOT EXISTS sound_title TEXT;
ALTER TABLE public.reels ADD COLUMN IF NOT EXISTS sound_artist TEXT;
ALTER TABLE public.reels ADD COLUMN IF NOT EXISTS sound_audio_url TEXT;
ALTER TABLE public.reels ADD COLUMN IF NOT EXISTS sound_start_time INTEGER DEFAULT 0;
ALTER TABLE public.reels ADD COLUMN IF NOT EXISTS is_original_sound BOOLEAN DEFAULT true;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_admin_music_active ON public.admin_music_library(is_active);
CREATE INDEX IF NOT EXISTS idx_admin_music_category ON public.admin_music_library(category);
CREATE INDEX IF NOT EXISTS idx_reels_sound_title ON public.reels(sound_title);