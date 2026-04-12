-- Add missing columns from backup

-- blocked_ips: add is_permanent
ALTER TABLE public.blocked_ips ADD COLUMN IF NOT EXISTS is_permanent boolean DEFAULT false;

-- live_streams: add music and heartbeat columns
ALTER TABLE public.live_streams ADD COLUMN IF NOT EXISTS last_heartbeat timestamptz DEFAULT now();
ALTER TABLE public.live_streams ADD COLUMN IF NOT EXISTS current_music_url text;
ALTER TABLE public.live_streams ADD COLUMN IF NOT EXISTS current_music_title text;
ALTER TABLE public.live_streams ADD COLUMN IF NOT EXISTS music_playing boolean DEFAULT false;
ALTER TABLE public.live_streams ADD COLUMN IF NOT EXISTS music_started_at timestamptz;

-- profiles: add last_active_at as separate tracking column
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_active_at timestamptz;