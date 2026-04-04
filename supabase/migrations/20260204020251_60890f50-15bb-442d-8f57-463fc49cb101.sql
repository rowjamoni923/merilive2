-- Add fields for host-uploaded music sync in party rooms
ALTER TABLE public.party_rooms 
ADD COLUMN IF NOT EXISTS current_music_url TEXT,
ADD COLUMN IF NOT EXISTS current_music_title TEXT,
ADD COLUMN IF NOT EXISTS music_started_at TIMESTAMP WITH TIME ZONE;

-- Add same fields for live_streams
ALTER TABLE public.live_streams 
ADD COLUMN IF NOT EXISTS current_music_url TEXT,
ADD COLUMN IF NOT EXISTS current_music_title TEXT,
ADD COLUMN IF NOT EXISTS music_playing BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS music_started_at TIMESTAMP WITH TIME ZONE;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_party_rooms_music_playing ON public.party_rooms (music_playing) WHERE music_playing = true;
CREATE INDEX IF NOT EXISTS idx_live_streams_music_playing ON public.live_streams (music_playing) WHERE music_playing = true;