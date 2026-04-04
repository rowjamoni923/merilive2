-- Add city and region columns to profiles table for storing detailed location
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS city TEXT,
ADD COLUMN IF NOT EXISTS region TEXT;

-- Add comment for clarity
COMMENT ON COLUMN public.profiles.city IS 'User city/locality from geolocation';
COMMENT ON COLUMN public.profiles.region IS 'User region/state/division from geolocation';