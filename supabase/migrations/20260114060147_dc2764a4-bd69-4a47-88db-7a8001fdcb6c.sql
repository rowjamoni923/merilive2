-- Enable anonymous sign-ins by updating auth settings
-- This allows guest accounts without email
-- Note: Anonymous auth must also be enabled in Supabase Dashboard > Authentication > Providers

-- For now, let's create a function to handle guest registration more reliably
CREATE OR REPLACE FUNCTION public.create_guest_profile(
  p_display_name TEXT,
  p_gender TEXT,
  p_user_id UUID
)
RETURNS BOOLEAN AS $$
BEGIN
  UPDATE public.profiles
  SET 
    display_name = p_display_name,
    gender = p_gender,
    is_host = (p_gender = 'female'),
    host_status = CASE WHEN p_gender = 'female' THEN 'approved' ELSE NULL END
  WHERE id = p_user_id;
  
  RETURN TRUE;
EXCEPTION WHEN OTHERS THEN
  RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;