ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS rating_banner_dismissed BOOLEAN DEFAULT false;

-- Update RLS policies (usually existing policies cover all columns, but let's be sure)
-- Assuming profiles table already has proper RLS.

-- Grant access to authenticated users to update their own dismissal flag
GRANT UPDATE(rating_banner_dismissed) ON public.profiles TO authenticated;
