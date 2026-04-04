-- Add category and animation_url columns to gifts table
ALTER TABLE public.gifts 
ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'popular',
ADD COLUMN IF NOT EXISTS animation_url TEXT,
ADD COLUMN IF NOT EXISTS display_order INTEGER DEFAULT 0;

-- Create index for category filtering
CREATE INDEX IF NOT EXISTS idx_gifts_category ON public.gifts(category);
CREATE INDEX IF NOT EXISTS idx_gifts_display_order ON public.gifts(display_order);