
-- Fix: Recreate profiles_public WITHOUT security_invoker so all authenticated users can view other users' public profiles
-- This is safe because the view only exposes non-sensitive columns (no coins, device_id, passwords, etc.)

DROP VIEW IF EXISTS public.profiles_public;

CREATE VIEW public.profiles_public AS
SELECT 
    id,
    display_name,
    username,
    avatar_url,
    bio,
    country_code,
    country_flag,
    country_name,
    city,
    region,
    user_level,
    host_level,
    previous_host_level,
    is_online,
    is_in_call,
    is_host,
    gender,
    call_rate_per_minute,
    is_verified,
    is_face_verified,
    created_at,
    frame_id,
    is_blocked,
    last_seen_at,
    equipped_frame_id,
    equipped_entrance_id,
    equipped_bubble_id,
    equipped_vehicle_id,
    equipped_entry_banner_id,
    equipped_entry_name_bar_id,
    equipped_medal_id,
    equipped_noble_card_id,
    current_vip_tier_id,
    vip_expires_at,
    age,
    tags,
    cover_url,
    app_uid,
    hide_location,
    host_status,
    host_availability
FROM profiles
WHERE is_blocked IS NOT TRUE;

-- Grant access to authenticated and anon users
GRANT SELECT ON public.profiles_public TO authenticated;
GRANT SELECT ON public.profiles_public TO anon;
