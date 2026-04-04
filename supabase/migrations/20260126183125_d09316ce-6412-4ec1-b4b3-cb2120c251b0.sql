-- Create a security definer function to clear frame references before deletion
-- This bypasses RLS and allows admin to clear frame_id from all profiles
CREATE OR REPLACE FUNCTION public.admin_clear_frame_references(frame_id_to_clear UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Clear frame_id from all profiles using this frame
  UPDATE profiles 
  SET frame_id = NULL 
  WHERE frame_id = frame_id_to_clear;
  
  -- Clear equipped_frame_id from all profiles using this frame
  UPDATE profiles 
  SET equipped_frame_id = NULL 
  WHERE equipped_frame_id = frame_id_to_clear;
END;
$$;

-- Grant execute permission to authenticated users (admins check happens in app)
GRANT EXECUTE ON FUNCTION public.admin_clear_frame_references(UUID) TO authenticated;