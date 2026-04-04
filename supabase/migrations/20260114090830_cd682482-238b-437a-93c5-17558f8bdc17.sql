-- Create banners table for dynamic banner management
CREATE TABLE public.banners (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  subtitle TEXT,
  image_url TEXT,
  link_url TEXT,
  link_type TEXT DEFAULT 'popup', -- 'popup', 'internal', 'external'
  background_color TEXT DEFAULT '#8B1538',
  text_color TEXT DEFAULT '#FFFFFF',
  accent_color TEXT DEFAULT '#FFD700',
  display_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  start_date TIMESTAMP WITH TIME ZONE,
  end_date TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.banners ENABLE ROW LEVEL SECURITY;

-- Public can view active banners
CREATE POLICY "Anyone can view active banners"
ON public.banners
FOR SELECT
USING (is_active = true);

-- Only admins can manage banners
CREATE POLICY "Admins can manage banners"
ON public.banners
FOR ALL
USING (public.is_admin(auth.uid()));

-- Create trigger for updated_at
CREATE TRIGGER update_banners_updated_at
BEFORE UPDATE ON public.banners
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default banner
INSERT INTO public.banners (title, subtitle, background_color, text_color, accent_color, is_active)
VALUES ('2026 GALA', 'Special Event Coming Soon!', '#8B1538', '#FFFFFF', '#FFD700', true);