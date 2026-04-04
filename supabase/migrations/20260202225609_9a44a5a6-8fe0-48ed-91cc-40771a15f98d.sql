-- Create table for party room backgrounds (Admin-managed)
CREATE TABLE public.party_room_backgrounds (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  image_url TEXT,
  gradient_css TEXT,
  category TEXT DEFAULT 'free',
  price_diamonds INTEGER DEFAULT 0,
  is_premium BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.party_room_backgrounds ENABLE ROW LEVEL SECURITY;

-- Allow all users to read backgrounds
CREATE POLICY "Anyone can view active backgrounds"
  ON public.party_room_backgrounds
  FOR SELECT
  USING (is_active = true);

-- Insert default backgrounds
INSERT INTO public.party_room_backgrounds (name, gradient_css, category, is_premium, display_order) VALUES
  ('Default Purple', 'bg-gradient-to-br from-purple-900 via-indigo-900 to-blue-900', 'free', false, 1),
  ('Purple Dreams', 'bg-gradient-to-br from-purple-600 via-pink-500 to-orange-400', 'free', false, 2),
  ('Ocean Blue', 'bg-gradient-to-br from-cyan-500 via-blue-600 to-indigo-700', 'free', false, 3),
  ('Sunset Vibes', 'bg-gradient-to-br from-orange-500 via-red-500 to-pink-600', 'free', false, 4),
  ('Forest', 'bg-gradient-to-br from-green-500 via-emerald-600 to-teal-700', 'free', false, 5),
  ('Golden Hour', 'bg-gradient-to-br from-yellow-400 via-amber-500 to-orange-600', 'premium', true, 6),
  ('Midnight', 'bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900', 'free', false, 7),
  ('Neon Lights', 'bg-gradient-to-br from-pink-500 via-purple-600 to-indigo-600', 'premium', true, 8),
  ('Aurora', 'bg-gradient-to-br from-green-400 via-cyan-500 to-blue-600', 'premium', true, 9),
  ('Royal Gold', 'bg-gradient-to-br from-amber-500 via-yellow-500 to-amber-600', 'premium', true, 10);

-- Add active_seats column to party_rooms if not exists
ALTER TABLE public.party_rooms ADD COLUMN IF NOT EXISTS active_seats INTEGER DEFAULT 10;

-- Add background_id column to party_rooms if not exists  
ALTER TABLE public.party_rooms ADD COLUMN IF NOT EXISTS background_id UUID REFERENCES public.party_room_backgrounds(id);

-- Add music columns to party_rooms for active music
ALTER TABLE public.party_rooms ADD COLUMN IF NOT EXISTS current_music_id UUID REFERENCES public.admin_music_library(id);
ALTER TABLE public.party_rooms ADD COLUMN IF NOT EXISTS music_playing BOOLEAN DEFAULT false;