
ALTER TABLE public.first_recharge_bonus
  ADD COLUMN IF NOT EXISTS bonus_multiplier numeric DEFAULT 2.0,
  ADD COLUMN IF NOT EXISTS bonus_label text DEFAULT '2x Bonus',
  ADD COLUMN IF NOT EXISTS description text DEFAULT '',
  ADD COLUMN IF NOT EXISTS banner_image_url text,
  ADD COLUMN IF NOT EXISTS banner_title text,
  ADD COLUMN IF NOT EXISTS banner_subtitle text,
  ADD COLUMN IF NOT EXISTS banner_type text DEFAULT 'default';

-- Sync bonus_multiplier from existing bonus_percentage
UPDATE public.first_recharge_bonus 
SET bonus_multiplier = COALESCE(bonus_percentage / 100.0, 2.0)
WHERE bonus_multiplier IS NULL OR bonus_multiplier = 2.0;
