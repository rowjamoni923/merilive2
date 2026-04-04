-- Entry Banners table for room entrance animations
CREATE TABLE public.entry_banners (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  animation_url TEXT NOT NULL,
  preview_url TEXT,
  min_level INTEGER DEFAULT 0,
  min_vip_tier INTEGER DEFAULT 0,
  price_diamonds INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  is_premium BOOLEAN DEFAULT false,
  display_order INTEGER DEFAULT 0,
  duration_ms INTEGER DEFAULT 3000,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.entry_banners ENABLE ROW LEVEL SECURITY;

-- Everyone can view active entry banners
CREATE POLICY "Anyone can view active entry banners" 
ON public.entry_banners 
FOR SELECT 
USING (is_active = true);

-- Add equipped_entry_banner_id to profiles table
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS equipped_entry_banner_id UUID REFERENCES public.entry_banners(id);

-- User owned entry banners (purchased or earned)
CREATE TABLE public.user_entry_banners (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  entry_banner_id UUID NOT NULL REFERENCES public.entry_banners(id) ON DELETE CASCADE,
  acquired_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  acquired_type TEXT DEFAULT 'purchase',
  expires_at TIMESTAMP WITH TIME ZONE,
  UNIQUE(user_id, entry_banner_id)
);

-- Enable RLS on user_entry_banners
ALTER TABLE public.user_entry_banners ENABLE ROW LEVEL SECURITY;

-- Users can view their own entry banners
CREATE POLICY "Users can view their own entry banners"
ON public.user_entry_banners
FOR SELECT
USING (auth.uid() = user_id);

-- Users can insert their own entry banners
CREATE POLICY "Users can acquire entry banners"
ON public.user_entry_banners
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Create trigger for updated_at
CREATE TRIGGER update_entry_banners_updated_at
BEFORE UPDATE ON public.entry_banners
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create index for faster lookups
CREATE INDEX idx_entry_banners_active ON public.entry_banners(is_active, display_order);
CREATE INDEX idx_user_entry_banners_user ON public.user_entry_banners(user_id);