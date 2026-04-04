-- Create entry_name_bars table for SVGA flying name banners
CREATE TABLE public.entry_name_bars (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  animation_url TEXT NOT NULL,
  preview_url TEXT,
  min_level INTEGER DEFAULT 1,
  min_vip_tier INTEGER DEFAULT 0,
  price_diamonds INTEGER DEFAULT 0,
  duration_ms INTEGER DEFAULT 4000,
  display_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  is_premium BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.entry_name_bars ENABLE ROW LEVEL SECURITY;

-- Policy: Everyone can view active entry name bars
CREATE POLICY "Anyone can view active entry name bars"
ON public.entry_name_bars
FOR SELECT
USING (is_active = true);

-- Policy: Admins can manage entry name bars
CREATE POLICY "Admins can manage entry name bars"
ON public.entry_name_bars
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'admin'
  )
);

-- Add equipped_entry_name_bar_id column to profiles
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS equipped_entry_name_bar_id UUID REFERENCES public.entry_name_bars(id) ON DELETE SET NULL;

-- Create index for faster queries
CREATE INDEX idx_entry_name_bars_active ON public.entry_name_bars(is_active, display_order);
CREATE INDEX idx_profiles_entry_name_bar ON public.profiles(equipped_entry_name_bar_id);

-- Add trigger for updated_at
CREATE TRIGGER update_entry_name_bars_updated_at
BEFORE UPDATE ON public.entry_name_bars
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();