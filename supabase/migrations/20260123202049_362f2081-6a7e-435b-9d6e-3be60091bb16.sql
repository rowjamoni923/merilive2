-- Add animation URL columns to vip_tiers table for VIP exclusive animations
ALTER TABLE public.vip_tiers 
ADD COLUMN IF NOT EXISTS frame_animation_url TEXT,
ADD COLUMN IF NOT EXISTS entry_animation_url TEXT,
ADD COLUMN IF NOT EXISTS bubble_animation_url TEXT,
ADD COLUMN IF NOT EXISTS badge_animation_url TEXT;