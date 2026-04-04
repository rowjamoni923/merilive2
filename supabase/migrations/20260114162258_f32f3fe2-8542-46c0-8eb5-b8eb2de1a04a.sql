-- Create user_level_tiers table for admin-configurable level system
CREATE TABLE IF NOT EXISTS public.user_level_tiers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  level_number INTEGER NOT NULL,
  level_name TEXT NOT NULL,
  min_topup_amount INTEGER NOT NULL DEFAULT 0,
  min_earning_amount INTEGER NOT NULL DEFAULT 0,
  level_icon TEXT DEFAULT '💎',
  level_color TEXT DEFAULT '#3b82f6',
  bg_gradient TEXT DEFAULT 'from-blue-400 to-blue-500',
  tier_type TEXT NOT NULL DEFAULT 'user' CHECK (tier_type IN ('user', 'host')),
  is_active BOOLEAN DEFAULT true,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  CONSTRAINT user_level_tiers_level_tier_unique UNIQUE (level_number, tier_type)
);

-- Enable RLS
ALTER TABLE public.user_level_tiers ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Anyone can view level tiers" 
ON public.user_level_tiers 
FOR SELECT 
USING (true);

-- Insert level tiers for users (based on top-up)
INSERT INTO public.user_level_tiers (level_number, level_name, min_topup_amount, level_icon, level_color, bg_gradient, tier_type, display_order) VALUES
(0, 'Beginner', 0, '🤍', '#9ca3af', 'from-gray-300 to-gray-400', 'user', 0),
(1, 'Bronze', 10000, '💎', '#60a5fa', 'from-blue-400 to-blue-500', 'user', 1),
(2, 'Silver', 30000, '💎', '#3b82f6', 'from-blue-500 to-blue-600', 'user', 2),
(3, 'Gold', 100000, '💎', '#2563eb', 'from-blue-600 to-indigo-500', 'user', 3),
(4, 'Platinum', 300000, '💎', '#1d4ed8', 'from-indigo-500 to-indigo-600', 'user', 4),
(5, 'Diamond', 1000000, '💎', '#6366f1', 'from-indigo-600 to-purple-500', 'user', 5),
(6, 'Master', 3000000, '⭐', '#a855f7', 'from-purple-500 to-purple-600', 'user', 6),
(7, 'Grand Master', 10000000, '⭐', '#9333ea', 'from-purple-600 to-pink-500', 'user', 7),
(8, 'Legend', 30000000, '👑', '#7c3aed', 'from-pink-500 to-rose-500', 'user', 8);

-- Insert level tiers for hosts (based on earnings)
INSERT INTO public.user_level_tiers (level_number, level_name, min_earning_amount, level_icon, level_color, bg_gradient, tier_type, display_order) VALUES
(0, 'New Host', 0, '🌸', '#f9a8d4', 'from-pink-200 to-pink-300', 'host', 0),
(1, 'Rising Star', 5000, '🌷', '#f472b6', 'from-pink-400 to-rose-400', 'host', 1),
(2, 'Popular', 15000, '🌺', '#ec4899', 'from-rose-400 to-pink-500', 'host', 2),
(3, 'Famous', 50000, '🌹', '#f43f5e', 'from-pink-500 to-rose-500', 'host', 3),
(4, 'Star', 150000, '💐', '#e11d48', 'from-rose-500 to-rose-600', 'host', 4),
(5, 'Super Star', 500000, '💜', '#a855f7', 'from-rose-600 to-purple-500', 'host', 5),
(6, 'Queen', 1500000, '👑', '#9333ea', 'from-purple-500 to-purple-600', 'host', 6),
(7, 'Goddess', 5000000, '👸', '#7c3aed', 'from-purple-600 to-violet-600', 'host', 7),
(8, 'Legend', 15000000, '👸', '#f59e0b', 'from-amber-400 to-amber-500', 'host', 8);