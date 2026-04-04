
-- Create popup event banners table
CREATE TABLE public.popup_event_banners (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  image_url TEXT NOT NULL,
  link_url TEXT,
  link_type TEXT DEFAULT 'internal',
  display_duration_seconds INTEGER NOT NULL DEFAULT 3,
  is_active BOOLEAN DEFAULT true,
  display_order INTEGER DEFAULT 0,
  start_date TIMESTAMPTZ,
  end_date TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.popup_event_banners ENABLE ROW LEVEL SECURITY;

-- Public read for active banners
CREATE POLICY "Anyone can view active popup banners"
ON public.popup_event_banners
FOR SELECT
USING (is_active = true);

-- Admin full access
CREATE POLICY "Admins can manage popup banners"
ON public.popup_event_banners
FOR ALL
USING (
  EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid() AND is_active = true)
);

-- Trigger for updated_at
CREATE TRIGGER update_popup_event_banners_updated_at
BEFORE UPDATE ON public.popup_event_banners
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
