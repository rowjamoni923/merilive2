
-- Table to log face detection violations during live streams
CREATE TABLE public.live_face_violations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  host_id UUID NOT NULL REFERENCES public.profiles(id),
  stream_id UUID,
  violation_type TEXT NOT NULL DEFAULT 'no_face', -- 'no_face', 'dark_camera', 'covered_camera'
  detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  auto_closed BOOLEAN DEFAULT true,
  countdown_duration INTEGER DEFAULT 15, -- seconds given before auto-close
  notes TEXT,
  admin_reviewed BOOLEAN DEFAULT false,
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ,
  action_taken TEXT, -- 'warning', 'live_ban', 'permanent_ban'
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.live_face_violations ENABLE ROW LEVEL SECURITY;

-- Hosts can view their own violations
CREATE POLICY "Users can view own face violations"
  ON public.live_face_violations FOR SELECT
  USING (auth.uid() = host_id);

-- Hosts can insert their own violations (auto-detected)
CREATE POLICY "Users can insert own face violations"
  ON public.live_face_violations FOR INSERT
  WITH CHECK (auth.uid() = host_id);

-- Service role can do everything (for edge functions & admin)
CREATE POLICY "Service role full access face violations"
  ON public.live_face_violations FOR ALL
  USING (true)
  WITH CHECK (true);

-- Grant permissions
GRANT SELECT, INSERT ON public.live_face_violations TO authenticated;

-- Add to realtime for admin alerts
ALTER TABLE public.live_face_violations REPLICA IDENTITY FULL;

-- Index for admin queries
CREATE INDEX idx_live_face_violations_host ON public.live_face_violations(host_id);
CREATE INDEX idx_live_face_violations_created ON public.live_face_violations(created_at DESC);
CREATE INDEX idx_live_face_violations_reviewed ON public.live_face_violations(admin_reviewed);
