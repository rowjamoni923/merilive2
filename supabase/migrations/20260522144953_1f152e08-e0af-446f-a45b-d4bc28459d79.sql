
-- Pkg126: HLS Egress support — adds .m3u8 + segmented .ts playlist columns
-- and back-fills missing Pkg111/112 columns (idempotent so prior partial
-- migration state is safe).

-- live_streams: HLS-specific fields
ALTER TABLE public.live_streams
  ADD COLUMN IF NOT EXISTS hls_egress_id text,
  ADD COLUMN IF NOT EXISTS hls_playlist_url text,
  ADD COLUMN IF NOT EXISTS hls_status text,
  ADD COLUMN IF NOT EXISTS egress_id text,
  ADD COLUMN IF NOT EXISTS recording_status text,
  ADD COLUMN IF NOT EXISTS room_name text;

-- stream_recordings: format + Pkg111 cols (back-fill idempotently)
ALTER TABLE public.stream_recordings
  ADD COLUMN IF NOT EXISTS format text DEFAULT 'mp4',
  ADD COLUMN IF NOT EXISTS egress_id text,
  ADD COLUMN IF NOT EXISTS file_url text,
  ADD COLUMN IF NOT EXISTS size_bytes bigint,
  ADD COLUMN IF NOT EXISTS error text,
  ADD COLUMN IF NOT EXISTS output_type text,
  ADD COLUMN IF NOT EXISTS playlist_url text,
  ADD COLUMN IF NOT EXISTS room_name text;

CREATE INDEX IF NOT EXISTS idx_stream_recordings_egress_id
  ON public.stream_recordings(egress_id) WHERE egress_id IS NOT NULL;

-- Add hls_egress kill-switch (default OFF) to existing JSON blob
UPDATE public.app_settings
SET setting_value = (
  CASE
    WHEN setting_value IS NULL OR setting_value = '' THEN '{"hls_egress": false}'
    WHEN (setting_value::jsonb) ? 'hls_egress' THEN setting_value
    ELSE ((setting_value::jsonb) || '{"hls_egress": false}'::jsonb)::text
  END
)
WHERE setting_key = 'livekit_signaling_enabled';

INSERT INTO public.app_settings (setting_key, setting_value, description)
SELECT 'livekit_signaling_enabled', '{"hls_egress": false}', 'LiveKit feature kill-switches'
WHERE NOT EXISTS (SELECT 1 FROM public.app_settings WHERE setting_key = 'livekit_signaling_enabled');
