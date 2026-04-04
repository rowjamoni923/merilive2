
-- Add banner fields to first_recharge_bonus table
ALTER TABLE public.first_recharge_bonus 
  ADD COLUMN IF NOT EXISTS banner_image_url TEXT,
  ADD COLUMN IF NOT EXISTS banner_title TEXT DEFAULT 'First Recharge Bonus!',
  ADD COLUMN IF NOT EXISTS banner_subtitle TEXT DEFAULT 'Get extra bonus diamonds on your first purchase',
  ADD COLUMN IF NOT EXISTS banner_type TEXT DEFAULT 'image' CHECK (banner_type IN ('image', 'text'));
