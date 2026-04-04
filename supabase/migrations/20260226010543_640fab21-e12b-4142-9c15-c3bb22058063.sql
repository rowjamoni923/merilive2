
-- Add previous_host_level column to profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS previous_host_level integer DEFAULT 0;

-- Update the weekly reset function to save current level as previous before resetting
CREATE OR REPLACE FUNCTION public.reset_host_levels_weekly()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Save current host_level as previous_host_level, then reset
  UPDATE profiles
  SET 
    previous_host_level = COALESCE(host_level, 0),
    host_level = 0,
    weekly_earnings = 0,
    weekly_reset_at = now()
  WHERE 
    is_host = true
    AND weekly_reset_at < (now() - interval '7 days');
    
  RAISE NOTICE 'Weekly host level reset completed at %. Previous levels saved.', now();
END;
$$;

-- Initialize previous_host_level for existing hosts
UPDATE profiles
SET previous_host_level = COALESCE(host_level, 0)
WHERE is_host = true AND previous_host_level IS NULL OR previous_host_level = 0;
