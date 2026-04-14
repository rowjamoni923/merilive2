-- Add missing columns to party_rooms for Discover page
ALTER TABLE public.party_rooms
  ADD COLUMN IF NOT EXISTS entry_fee integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS min_level integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS game_mode text DEFAULT NULL;

-- Add missing columns to reels for Reels page
ALTER TABLE public.reels
  ADD COLUMN IF NOT EXISTS comment_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS share_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS music_title text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS music_artist text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS sound_id uuid DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS sound_title text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS sound_artist text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS sound_audio_url text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS is_original_sound boolean DEFAULT true;