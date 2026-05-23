
CREATE TABLE IF NOT EXISTS public.live_frame_alerts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  context TEXT NOT NULL DEFAULT 'live_stream',
  room_id TEXT,
  stream_id TEXT,
  severity TEXT NOT NULL,
  alerts JSONB NOT NULL DEFAULT '[]'::jsonb,
  face_present BOOLEAN,
  face_count INTEGER,
  nsfw_score NUMERIC,
  violence_score NUMERIC,
  weapons_detected BOOLEAN DEFAULT false,
  drugs_detected BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_live_frame_alerts_user_created
  ON public.live_frame_alerts (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_live_frame_alerts_severity_created
  ON public.live_frame_alerts (severity, created_at DESC);

ALTER TABLE public.live_frame_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view live frame alerts"
  ON public.live_frame_alerts
  FOR SELECT
  TO authenticated
  USING (public.is_admin(auth.uid()));
