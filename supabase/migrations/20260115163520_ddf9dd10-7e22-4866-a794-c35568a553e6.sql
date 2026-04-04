-- Update all hosts with the old default rate (60) to use NULL so they inherit from admin settings
-- This allows the admin default_rate setting to properly apply
UPDATE public.profiles 
SET call_rate_per_minute = NULL 
WHERE is_host = true AND call_rate_per_minute = 60;

-- Also update the column default to NULL so new hosts inherit from admin settings
ALTER TABLE public.profiles 
ALTER COLUMN call_rate_per_minute DROP DEFAULT;