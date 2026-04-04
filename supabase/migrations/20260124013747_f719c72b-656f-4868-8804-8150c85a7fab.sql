-- Add device_id column to profiles for persistent device-based account recovery
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS device_id TEXT;

-- Create index for faster device ID lookups
CREATE INDEX IF NOT EXISTS idx_profiles_device_id ON public.profiles(device_id) WHERE device_id IS NOT NULL;

-- Create a function to find account by device ID
CREATE OR REPLACE FUNCTION public.get_account_by_device_id(p_device_id TEXT)
RETURNS TABLE (
  user_id UUID,
  display_name TEXT,
  avatar_url TEXT,
  gender TEXT,
  is_host BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p.id,
    p.display_name,
    p.avatar_url,
    p.gender,
    p.is_host
  FROM public.profiles p
  WHERE p.device_id = p_device_id
  AND p.is_deleted IS NOT TRUE
  LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;