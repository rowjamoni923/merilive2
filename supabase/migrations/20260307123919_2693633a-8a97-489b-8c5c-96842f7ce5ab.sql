
-- Beauty Filters / DeepAR Effects table
CREATE TABLE public.beauty_filters (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL DEFAULT 'beauty',
  file_url TEXT NOT NULL,
  preview_image_url TEXT,
  file_type TEXT NOT NULL DEFAULT 'deepar',
  file_size_bytes BIGINT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_premium BOOLEAN NOT NULL DEFAULT false,
  is_free BOOLEAN NOT NULL DEFAULT true,
  price_diamonds INTEGER DEFAULT 0,
  min_level INTEGER DEFAULT 0,
  display_order INTEGER DEFAULT 0,
  tags TEXT[] DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- AR Stickers table
CREATE TABLE public.ar_stickers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL DEFAULT 'fun',
  file_url TEXT NOT NULL,
  preview_image_url TEXT,
  file_type TEXT NOT NULL DEFAULT 'deepar',
  file_size_bytes BIGINT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_premium BOOLEAN NOT NULL DEFAULT false,
  is_free BOOLEAN NOT NULL DEFAULT true,
  price_diamonds INTEGER DEFAULT 0,
  min_level INTEGER DEFAULT 0,
  display_order INTEGER DEFAULT 0,
  tags TEXT[] DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.beauty_filters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ar_stickers ENABLE ROW LEVEL SECURITY;

-- Public read for active items
CREATE POLICY "Anyone can view active beauty filters" ON public.beauty_filters
  FOR SELECT USING (is_active = true);

CREATE POLICY "Anyone can view active ar stickers" ON public.ar_stickers
  FOR SELECT USING (is_active = true);

-- Admin full access (via service role or admin check)
CREATE POLICY "Admin full access beauty_filters" ON public.beauty_filters
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = auth.uid() AND is_active = true)
  );

CREATE POLICY "Admin full access ar_stickers" ON public.ar_stickers
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = auth.uid() AND is_active = true)
  );

-- Indexes
CREATE INDEX idx_beauty_filters_active ON public.beauty_filters(is_active, display_order);
CREATE INDEX idx_beauty_filters_category ON public.beauty_filters(category);
CREATE INDEX idx_ar_stickers_active ON public.ar_stickers(is_active, display_order);
CREATE INDEX idx_ar_stickers_category ON public.ar_stickers(category);
