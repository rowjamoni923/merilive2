-- Phase III.f — per-room audio profile override for party rooms.
-- Default NULL = auto (audio rooms → voice, video/game → music).
-- Hosts of DJ-style audio rooms can set 'music' to upgrade bitrate.
ALTER TABLE public.party_rooms
  ADD COLUMN IF NOT EXISTS audio_profile text
  CHECK (audio_profile IN ('voice', 'music'));

COMMENT ON COLUMN public.party_rooms.audio_profile IS
  'Phase III.f LiveKit audio profile override. NULL=auto by room_type, voice=24kbps mono speech preset, music=96kbps stereo musicHighQuality preset.';