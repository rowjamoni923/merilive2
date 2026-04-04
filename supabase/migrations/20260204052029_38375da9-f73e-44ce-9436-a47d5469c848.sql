-- Create the missing user_level_thresholds table
-- This table is required by the update_user_level_comprehensive trigger

CREATE TABLE IF NOT EXISTS public.user_level_thresholds (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  level_number INT NOT NULL UNIQUE,
  level_name TEXT,
  diamonds_required BIGINT NOT NULL DEFAULT 0,
  description TEXT,
  badge_url TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.user_level_thresholds ENABLE ROW LEVEL SECURITY;

-- Public read access (levels are public info)
CREATE POLICY "User level thresholds are publicly readable"
  ON public.user_level_thresholds
  FOR SELECT
  USING (true);

-- Insert default level thresholds matching the fallback logic in the trigger
INSERT INTO public.user_level_thresholds (level_number, level_name, diamonds_required, is_active)
VALUES 
  (0, 'Newcomer', 0, true),
  (1, 'Bronze I', 10000, true),
  (2, 'Bronze II', 30000, true),
  (3, 'Silver I', 100000, true),
  (4, 'Silver II', 300000, true),
  (5, 'Gold I', 1000000, true),
  (6, 'Gold II', 3000000, true),
  (7, 'Platinum I', 10000000, true),
  (8, 'Platinum II', 30000000, true),
  (9, 'Diamond I', 100000000, true),
  (10, 'Diamond II', 300000000, true),
  (20, 'Master', 1000000000, true),
  (30, 'Grandmaster', 3000000000, true),
  (40, 'Legend', 10000000000, true),
  (50, 'Immortal', 30000000000, true)
ON CONFLICT (level_number) DO NOTHING;