-- Create table for room welcome/warning messages (Admin configurable)
CREATE TABLE public.room_welcome_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  room_type TEXT NOT NULL, -- 'live', 'party_audio', 'party_video', 'party_game'
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  display_order INT DEFAULT 0,
  icon_emoji TEXT DEFAULT '⚠️',
  background_color TEXT DEFAULT 'from-amber-500/20 to-orange-500/20',
  text_color TEXT DEFAULT 'text-amber-100',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(room_type)
);

-- Enable RLS
ALTER TABLE public.room_welcome_messages ENABLE ROW LEVEL SECURITY;

-- Public read access (everyone can see welcome messages)
CREATE POLICY "Anyone can view active welcome messages"
ON public.room_welcome_messages
FOR SELECT
USING (is_active = true);

-- Admin write access
CREATE POLICY "Admins can manage welcome messages"
ON public.room_welcome_messages
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.admin_users au
    WHERE au.user_id = auth.uid()
    AND au.is_active = true
  )
);

-- Insert default welcome messages
INSERT INTO public.room_welcome_messages (room_type, title, message, icon_emoji, background_color, text_color) VALUES
('live', 'Welcome to Live Stream!', 'Warning: Pornography, vulgarity, violence, gambling and other inappropriate content are strictly prohibited. AI system monitors 24/7. Violations will be punished severely!', '🔴', 'from-rose-500/25 to-pink-500/20', 'text-rose-100'),
('party_audio', 'Welcome to Audio Party Room!', 'Enjoy the music and conversation! Please be respectful to all participants. Inappropriate behavior, harassment, or offensive content is not tolerated. Have fun!', '🎵', 'from-purple-500/25 to-indigo-500/20', 'text-purple-100'),
('party_video', 'Welcome to Video Party Room!', 'Welcome to our video party! Please keep your camera content appropriate. No nudity, violence, or illegal content. AI monitoring is active 24/7. Enjoy responsibly!', '🎬', 'from-blue-500/25 to-cyan-500/20', 'text-blue-100'),
('party_game', 'Welcome to Game Party Room!', 'Ready to play? Join the fun! Fair play is required - no cheating or exploits. Be a good sport and respect other players. Let the games begin!', '🎮', 'from-green-500/25 to-emerald-500/20', 'text-green-100');

-- Create trigger for updated_at
CREATE TRIGGER update_room_welcome_messages_updated_at
BEFORE UPDATE ON public.room_welcome_messages
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();