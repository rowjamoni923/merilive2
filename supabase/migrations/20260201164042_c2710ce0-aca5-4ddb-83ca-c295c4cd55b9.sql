-- Add hide_location column to profiles table
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS hide_location BOOLEAN NOT NULL DEFAULT false;