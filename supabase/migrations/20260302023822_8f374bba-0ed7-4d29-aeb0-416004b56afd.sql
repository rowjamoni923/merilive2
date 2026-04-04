-- Add nav icon URL columns to app_event_themes for admin-uploadable nav icons
ALTER TABLE public.app_event_themes 
  ADD COLUMN IF NOT EXISTS nav_home_icon_url text,
  ADD COLUMN IF NOT EXISTS nav_party_icon_url text,
  ADD COLUMN IF NOT EXISTS nav_reels_icon_url text,
  ADD COLUMN IF NOT EXISTS nav_profile_icon_url text;