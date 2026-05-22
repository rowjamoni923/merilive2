-- Pkg114: LiveKit Stream Egress (RTMP push-out to YouTube/Facebook/Twitch)
-- Hosts can simulcast their live_streams room to one or more RTMP(S) URLs.

CREATE TABLE IF NOT EXISTS public.stream_simulcasts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  stream_id UUID REFERENCES public.live_streams(id) ON DELETE SET NULL,
  host_id UUID NOT NULL,
  room_name TEXT NOT NULL,
  egress_id TEXT NOT NULL UNIQUE,
  -- Sanitized RTMP URLs (stream keys masked) for display/audit.
  rtmp_urls_masked TEXT[] NOT NULL DEFAULT '{}',
  -- Provider tags (youtube/facebook/twitch/custom) parallel to rtmp_urls_masked.
  providers TEXT[] NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'starting',
  error TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  duration_seconds INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stream_simulcasts_host_created ON public.stream_simulcasts(host_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stream_simulcasts_stream ON public.stream_simulcasts(stream_id);

ALTER TABLE public.stream_simulcasts ENABLE ROW LEVEL SECURITY;

-- Host reads own simulcasts
CREATE POLICY "Hosts read own simulcasts"
ON public.stream_simulcasts
FOR SELECT
USING (auth.uid() = host_id);

-- Admin full access
CREATE POLICY "Admin session full access stream_simulcasts"
ON public.stream_simulcasts
FOR ALL
USING (public.is_active_admin_session())
WITH CHECK (public.is_active_admin_session());

-- Add stream_egress kill-switch (default false; admin opts in).
UPDATE public.app_settings
SET setting_value = (
  CASE
    WHEN setting_value IS NULL OR setting_value = '' THEN '{"stream_egress": false}'::text
    ELSE (
      COALESCE(setting_value::jsonb, '{}'::jsonb) || jsonb_build_object('stream_egress', false)
    )::text
  END
)
WHERE setting_key = 'livekit_signaling_enabled'
  AND (setting_value::jsonb ? 'stream_egress') IS NOT TRUE;