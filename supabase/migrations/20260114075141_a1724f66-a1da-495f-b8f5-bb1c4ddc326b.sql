
-- Create level_privileges table for storing privilege items with animations
CREATE TABLE public.level_privileges (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  privilege_type TEXT NOT NULL, -- 'entry_bar', 'portrait_frame', 'privilege_sticker', 'privilege_gift', 'entrance_effect', 'party_background'
  name TEXT NOT NULL,
  description TEXT,
  unlock_level INTEGER NOT NULL DEFAULT 1,
  animation_url TEXT, -- URL for Lottie/GIF animation
  preview_url TEXT, -- Preview image URL
  icon_name TEXT, -- Icon identifier
  icon_bg_color TEXT DEFAULT '#FEE2E2',
  icon_color TEXT DEFAULT '#EF4444',
  is_active BOOLEAN DEFAULT true,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create level_animations table for level-specific entrance animations
CREATE TABLE public.level_animations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  level INTEGER NOT NULL UNIQUE,
  animation_url TEXT NOT NULL, -- Lottie JSON or GIF URL
  animation_type TEXT DEFAULT 'lottie', -- 'lottie' or 'gif'
  preview_url TEXT,
  duration_ms INTEGER DEFAULT 3000,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create storage bucket for level animations
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('level-assets', 'level-assets', true, 10485760)
ON CONFLICT (id) DO NOTHING;

-- Enable RLS on level_privileges
ALTER TABLE public.level_privileges ENABLE ROW LEVEL SECURITY;

-- Enable RLS on level_animations
ALTER TABLE public.level_animations ENABLE ROW LEVEL SECURITY;

-- RLS Policies for level_privileges
CREATE POLICY "Anyone can view active privileges"
ON public.level_privileges
FOR SELECT
USING (is_active = true);

CREATE POLICY "Admins can manage privileges"
ON public.level_privileges
FOR ALL
USING (is_admin(auth.uid()));

-- RLS Policies for level_animations
CREATE POLICY "Anyone can view active animations"
ON public.level_animations
FOR SELECT
USING (is_active = true);

CREATE POLICY "Admins can manage animations"
ON public.level_animations
FOR ALL
USING (is_admin(auth.uid()));

-- Storage policies for level-assets bucket
CREATE POLICY "Anyone can view level assets"
ON storage.objects
FOR SELECT
USING (bucket_id = 'level-assets');

CREATE POLICY "Admins can upload level assets"
ON storage.objects
FOR INSERT
WITH CHECK (bucket_id = 'level-assets' AND is_admin(auth.uid()));

CREATE POLICY "Admins can update level assets"
ON storage.objects
FOR UPDATE
USING (bucket_id = 'level-assets' AND is_admin(auth.uid()));

CREATE POLICY "Admins can delete level assets"
ON storage.objects
FOR DELETE
USING (bucket_id = 'level-assets' AND is_admin(auth.uid()));

-- Insert default privilege types
INSERT INTO public.level_privileges (privilege_type, name, description, unlock_level, icon_name, icon_bg_color, icon_color, display_order) VALUES
('entry_bar', 'Entry Bar', 'রুমে প্রবেশের সময় স্ট্রাইকিং বার দেখাবে।', 1, 'Sparkles', '#FCE7F3', '#EC4899', 1),
('portrait_frame', 'Portrait Frame', 'সর্বত্র আপনার নোবেল স্ট্যাটাস দেখান।', 2, 'Crown', '#FEE2E2', '#EF4444', 2),
('privilege_sticker', 'Privilege Sticker', 'উচ্চ লেভেল ইউজারদের জন্য এক্সক্লুসিভ স্টিকার!', 3, 'Star', '#FCE7F3', '#EC4899', 3),
('privilege_gift', 'Privilege Gift', 'এক্সক্লুসিভ লাক্সারি গিফট দিন!', 4, 'Gift', '#FEE2E2', '#EF4444', 4),
('entrance_effect', 'Entrance Effect', 'এক্সক্লুসিভ ইফেক্ট সহ রুমে প্রবেশ করুন।', 5, 'Car', '#FEE2E2', '#EF4444', 5),
('party_background', 'Party Room Background', 'আপনার পার্টি রুমকে আলাদা করুন!', 6, 'Image', '#FEE2E2', '#EF4444', 6),
('customer_service', 'Exclusive Customer Service', 'এক্সক্লুসিভ WhatsApp কাস্টমার সার্ভিস।', 7, 'Headphones', '#FCE7F3', '#EC4899', 7);

-- Insert default level animations (1-50)
INSERT INTO public.level_animations (level, animation_url, animation_type, duration_ms) VALUES
(1, '', 'lottie', 2000),
(2, '', 'lottie', 2000),
(3, '', 'lottie', 2500),
(4, '', 'lottie', 2500),
(5, '', 'lottie', 3000),
(6, '', 'lottie', 3000),
(7, '', 'lottie', 3000),
(8, '', 'lottie', 3000),
(9, '', 'lottie', 3500),
(10, '', 'lottie', 3500),
(15, '', 'lottie', 3500),
(20, '', 'lottie', 4000),
(25, '', 'lottie', 4000),
(30, '', 'lottie', 4500),
(35, '', 'lottie', 4500),
(40, '', 'lottie', 5000),
(45, '', 'lottie', 5000),
(50, '', 'lottie', 6000);
