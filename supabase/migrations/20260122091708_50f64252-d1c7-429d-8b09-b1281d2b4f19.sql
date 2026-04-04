-- Create reels categories table
CREATE TABLE public.reel_categories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  icon TEXT,
  description TEXT,
  display_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create reels table
CREATE TABLE public.reels (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  category_id UUID REFERENCES public.reel_categories(id),
  video_url TEXT NOT NULL,
  thumbnail_url TEXT,
  caption TEXT,
  music_title TEXT,
  music_artist TEXT,
  duration INTEGER DEFAULT 0, -- in seconds
  view_count INTEGER DEFAULT 0,
  like_count INTEGER DEFAULT 0,
  comment_count INTEGER DEFAULT 0,
  share_count INTEGER DEFAULT 0,
  is_featured BOOLEAN DEFAULT false,
  is_approved BOOLEAN DEFAULT true,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create reel likes table
CREATE TABLE public.reel_likes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  reel_id UUID NOT NULL REFERENCES public.reels(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(reel_id, user_id)
);

-- Create reel comments table
CREATE TABLE public.reel_comments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  reel_id UUID NOT NULL REFERENCES public.reels(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  parent_id UUID REFERENCES public.reel_comments(id) ON DELETE CASCADE,
  like_count INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create reel shares table
CREATE TABLE public.reel_shares (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  reel_id UUID NOT NULL REFERENCES public.reels(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  share_type TEXT DEFAULT 'link', -- link, whatsapp, facebook, etc.
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create reel reports table
CREATE TABLE public.reel_reports (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  reel_id UUID NOT NULL REFERENCES public.reels(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'pending', -- pending, reviewed, resolved
  reviewed_by UUID REFERENCES public.profiles(id),
  reviewed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.reel_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reel_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reel_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reel_shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reel_reports ENABLE ROW LEVEL SECURITY;

-- RLS Policies for reel_categories (public read)
CREATE POLICY "Anyone can view active reel categories"
  ON public.reel_categories FOR SELECT
  USING (is_active = true);

-- RLS Policies for reels
CREATE POLICY "Anyone can view approved active reels"
  ON public.reels FOR SELECT
  USING (is_active = true AND is_approved = true);

CREATE POLICY "Hosts can create reels"
  ON public.reels FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own reels"
  ON public.reels FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own reels"
  ON public.reels FOR DELETE
  USING (auth.uid() = user_id);

-- RLS Policies for reel_likes
CREATE POLICY "Anyone can view reel likes"
  ON public.reel_likes FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can like reels"
  ON public.reel_likes FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can unlike their own likes"
  ON public.reel_likes FOR DELETE
  USING (auth.uid() = user_id);

-- RLS Policies for reel_comments
CREATE POLICY "Anyone can view active comments"
  ON public.reel_comments FOR SELECT
  USING (is_active = true);

CREATE POLICY "Authenticated users can comment"
  ON public.reel_comments FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own comments"
  ON public.reel_comments FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own comments"
  ON public.reel_comments FOR DELETE
  USING (auth.uid() = user_id);

-- RLS Policies for reel_shares
CREATE POLICY "Authenticated users can share reels"
  ON public.reel_shares FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Anyone can view shares"
  ON public.reel_shares FOR SELECT
  USING (true);

-- RLS Policies for reel_reports
CREATE POLICY "Authenticated users can report reels"
  ON public.reel_reports FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view their own reports"
  ON public.reel_reports FOR SELECT
  USING (auth.uid() = user_id);

-- Create storage bucket for reels
INSERT INTO storage.buckets (id, name, public)
VALUES ('reels', 'reels', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for reels bucket
CREATE POLICY "Anyone can view reels videos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'reels');

CREATE POLICY "Authenticated users can upload reels"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'reels' AND auth.uid() IS NOT NULL);

CREATE POLICY "Users can update their own reel files"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'reels' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete their own reel files"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'reels' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Insert default categories
INSERT INTO public.reel_categories (name, slug, icon, display_order) VALUES
  ('All', 'all', '🎬', 0),
  ('Dance', 'dance', '💃', 1),
  ('Singing', 'singing', '🎤', 2),
  ('Comedy', 'comedy', '😂', 3),
  ('Talent', 'talent', '⭐', 4),
  ('Fashion', 'fashion', '👗', 5),
  ('Beauty', 'beauty', '💄', 6),
  ('Lifestyle', 'lifestyle', '🌟', 7),
  ('Gaming', 'gaming', '🎮', 8),
  ('Food', 'food', '🍕', 9);

-- Create function to increment view count
CREATE OR REPLACE FUNCTION public.increment_reel_view(reel_uuid UUID)
RETURNS void AS $$
BEGIN
  UPDATE public.reels
  SET view_count = view_count + 1
  WHERE id = reel_uuid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;