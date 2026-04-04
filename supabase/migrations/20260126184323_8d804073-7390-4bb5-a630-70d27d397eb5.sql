-- Add missing sound_duration_ms column to shop_items table
ALTER TABLE public.shop_items 
ADD COLUMN IF NOT EXISTS sound_duration_ms INTEGER;