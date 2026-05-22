CREATE TABLE IF NOT EXISTS public.track_recordings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  stream_id UUID NULL,
  room_name TEXT NOT NULL,
  participant_identity TEXT NOT NULL,
  track_sid TEXT NULL,
  track_kind TEXT NULL,
  egress_id TEXT NOT NULL UNIQUE,
  output_type TEXT NOT NULL DEFAULT 's3',
  file_url TEXT NULL,
  duration_seconds INTEGER NULL,
  size_bytes BIGINT NULL,
  status TEXT NOT NULL DEFAULT 'starting',
  error TEXT NULL,
  reason TEXT NULL,
  initiated_by_role TEXT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_track_recordings_room ON public.track_recordings(room_name);
CREATE INDEX IF NOT EXISTS idx_track_recordings_status ON public.track_recordings(status);
CREATE INDEX IF NOT EXISTS idx_track_recordings_stream ON public.track_recordings(stream_id);

ALTER TABLE public.track_recordings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin session full access"
  ON public.track_recordings
  FOR ALL
  USING (public.is_active_admin_session())
  WITH CHECK (public.is_active_admin_session());

-- Add track_egress kill-switch (default false) into livekit_signaling_enabled jsonb
UPDATE public.app_settings
SET setting_value = (
  COALESCE(NULLIF(setting_value, '')::jsonb, '{}'::jsonb)
    || jsonb_build_object('track_egress', false)
)::text
WHERE setting_key = 'livekit_signaling_enabled'
  AND (NULLIF(setting_value, '')::jsonb ? 'track_egress') IS NOT TRUE;

INSERT INTO public.app_settings (setting_key, setting_value, description)
SELECT 'livekit_signaling_enabled',
       jsonb_build_object('track_egress', false)::text,
       'LiveKit signaling feature kill-switches'
WHERE NOT EXISTS (
  SELECT 1 FROM public.app_settings WHERE setting_key = 'livekit_signaling_enabled'
);