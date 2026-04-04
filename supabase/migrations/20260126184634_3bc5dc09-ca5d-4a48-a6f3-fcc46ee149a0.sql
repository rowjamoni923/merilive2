-- Add missing sound_url column to shop_items table
ALTER TABLE public.shop_items 
ADD COLUMN IF NOT EXISTS sound_url TEXT;