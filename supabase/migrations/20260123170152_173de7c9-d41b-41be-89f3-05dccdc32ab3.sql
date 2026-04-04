-- Add target_type column to avatar_frames (user, host, or both)
ALTER TABLE public.avatar_frames 
ADD COLUMN IF NOT EXISTS target_type text DEFAULT 'both' CHECK (target_type IN ('user', 'host', 'both'));

-- Add comment for clarity
COMMENT ON COLUMN public.avatar_frames.target_type IS 'Specifies if frame is for user levels, host levels, or both';

-- Create function to get the appropriate frame for a user/host based on their level
CREATE OR REPLACE FUNCTION public.get_level_frame(
  p_level integer,
  p_target_type text DEFAULT 'user'
)
RETURNS TABLE (
  id uuid,
  name text,
  frame_url text,
  frame_type text,
  animation_type text,
  min_level integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    af.id,
    af.name,
    af.frame_url,
    af.frame_type,
    af.animation_type,
    af.min_level
  FROM avatar_frames af
  WHERE af.is_active = true
    AND af.min_level <= p_level
    AND (af.target_type = p_target_type OR af.target_type = 'both')
  ORDER BY af.min_level DESC
  LIMIT 1;
END;
$$;

-- Create trigger function to auto-assign frame when user/host level changes
CREATE OR REPLACE FUNCTION public.auto_assign_level_frame()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_frame_id uuid;
  v_level integer;
  v_target_type text;
BEGIN
  -- Check if user_level changed
  IF NEW.user_level IS DISTINCT FROM OLD.user_level THEN
    v_level := COALESCE(NEW.user_level, 1);
    v_target_type := 'user';
    
    -- Find the best matching frame for this user level
    SELECT af.id INTO v_frame_id
    FROM avatar_frames af
    WHERE af.is_active = true
      AND af.min_level <= v_level
      AND (af.target_type = 'user' OR af.target_type = 'both')
    ORDER BY af.min_level DESC
    LIMIT 1;
    
    -- Update frame_id if found
    IF v_frame_id IS NOT NULL THEN
      NEW.frame_id := v_frame_id;
    END IF;
  END IF;
  
  -- Check if host_level changed
  IF NEW.host_level IS DISTINCT FROM OLD.host_level THEN
    v_level := COALESCE(NEW.host_level, 1);
    v_target_type := 'host';
    
    -- Find the best matching frame for this host level
    SELECT af.id INTO v_frame_id
    FROM avatar_frames af
    WHERE af.is_active = true
      AND af.min_level <= v_level
      AND (af.target_type = 'host' OR af.target_type = 'both')
    ORDER BY af.min_level DESC
    LIMIT 1;
    
    -- Update equipped_frame_id for hosts
    IF v_frame_id IS NOT NULL THEN
      NEW.equipped_frame_id := v_frame_id;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger on profiles table
DROP TRIGGER IF EXISTS trigger_auto_assign_level_frame ON profiles;
CREATE TRIGGER trigger_auto_assign_level_frame
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_assign_level_frame();