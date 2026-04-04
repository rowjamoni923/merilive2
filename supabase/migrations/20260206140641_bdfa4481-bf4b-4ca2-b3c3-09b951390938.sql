-- Leaderboard Podium Frames - special frames for top 3 positions
CREATE TABLE public.leaderboard_podium_frames (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  rank_position INTEGER NOT NULL CHECK (rank_position BETWEEN 1 AND 3),
  category TEXT NOT NULL DEFAULT 'host_earnings', -- host_earnings, game_winners
  frame_url TEXT NOT NULL,
  frame_type TEXT DEFAULT 'static', -- svga, gif, lottie, static, webp
  name TEXT NOT NULL DEFAULT '',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(rank_position, category)
);

-- Enable RLS
ALTER TABLE public.leaderboard_podium_frames ENABLE ROW LEVEL SECURITY;

-- Everyone can read active podium frames
CREATE POLICY "Anyone can read podium frames"
  ON public.leaderboard_podium_frames
  FOR SELECT
  USING (true);

-- Only admins can modify
CREATE POLICY "Admins can manage podium frames"
  ON public.leaderboard_podium_frames
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM admin_users 
      WHERE user_id = auth.uid() AND is_active = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM admin_users 
      WHERE user_id = auth.uid() AND is_active = true
    )
  );

-- Add leaderboard section to admin panel
INSERT INTO admin_sections (section_key, section_name, hub_key, icon_name, display_order, is_active, description)
VALUES ('leaderboard', 'Leaderboard', 'content-hub', 'Trophy', 35, true, 'Manage leaderboard podium frames and rewards')
ON CONFLICT (section_key) DO NOTHING;