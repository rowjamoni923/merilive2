-- Add frame_type column to support SVGA, Lottie, GIF formats
ALTER TABLE public.avatar_frames 
ADD COLUMN IF NOT EXISTS frame_type TEXT DEFAULT 'static' CHECK (frame_type IN ('svga', 'lottie', 'gif', 'webp', 'png', 'static'));

-- Add preview_url for static preview image (useful for SVGA/Lottie)
ALTER TABLE public.avatar_frames 
ADD COLUMN IF NOT EXISTS preview_url TEXT;

-- Add description field
ALTER TABLE public.avatar_frames 
ADD COLUMN IF NOT EXISTS description TEXT;

-- Add category for better organization
ALTER TABLE public.avatar_frames 
ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'general';

-- Add price_diamonds for purchasable frames
ALTER TABLE public.avatar_frames 
ADD COLUMN IF NOT EXISTS price_diamonds INTEGER DEFAULT 0;

-- Update animation_type to include all formats
COMMENT ON COLUMN public.avatar_frames.frame_type IS 'Frame file format: svga, lottie, gif, webp, png, static';
COMMENT ON COLUMN public.avatar_frames.animation_type IS 'Legacy: glow, pulse, spin, particles, shimmer, rainbow, fire, electric';

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_avatar_frames_type ON public.avatar_frames(frame_type);
CREATE INDEX IF NOT EXISTS idx_avatar_frames_category ON public.avatar_frames(category);
CREATE INDEX IF NOT EXISTS idx_avatar_frames_active ON public.avatar_frames(is_active) WHERE is_active = true;