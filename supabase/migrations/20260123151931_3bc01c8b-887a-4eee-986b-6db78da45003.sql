-- Add missing columns to gifts table
ALTER TABLE public.gifts 
ADD COLUMN IF NOT EXISTS sound_url TEXT,
ADD COLUMN IF NOT EXISTS sound_duration_ms INTEGER DEFAULT 3000;