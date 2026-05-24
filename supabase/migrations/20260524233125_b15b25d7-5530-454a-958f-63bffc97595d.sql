-- Bypass profile-protection triggers for this admin maintenance update.
DO $$
DECLARE
  v_supabase_url text := COALESCE(current_setting('app.supabase_url', true), 'https://ayjdlvuurscxucatbbah.supabase.co');
BEGIN
  PERFORM set_config('app.bypass_profile_protection', 'true', true);

  UPDATE public.profiles
  SET avatar_url = regexp_replace(
    avatar_url,
    '^https?://[^/]+/storage/v1/object/public/face-verification/',
    'https://ayjdlvuurscxucatbbah.supabase.co/functions/v1/public-profile-avatar/'
  )
  WHERE avatar_url LIKE '%/storage/v1/object/public/face-verification/%';

  PERFORM set_config('app.bypass_profile_protection', 'false', true);
END $$;