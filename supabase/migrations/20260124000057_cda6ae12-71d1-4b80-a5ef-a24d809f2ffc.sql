-- Create storage bucket for live stream recordings
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('live-recordings', 'live-recordings', false, 524288000, ARRAY['video/mp4', 'video/webm', 'audio/mp4', 'audio/webm'])
ON CONFLICT (id) DO NOTHING;

-- RLS policies for live recordings bucket (using user_roles table)
CREATE POLICY "Admins can view all recordings" ON storage.objects
FOR SELECT USING (bucket_id = 'live-recordings' AND EXISTS (
  SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin'
));

CREATE POLICY "Admins can delete old recordings" ON storage.objects
FOR DELETE USING (bucket_id = 'live-recordings' AND EXISTS (
  SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin'
));

-- Create table for stream recordings metadata
CREATE TABLE IF NOT EXISTS public.stream_recordings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  stream_id UUID REFERENCES public.live_streams(id) ON DELETE CASCADE,
  host_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  host_uid TEXT,
  host_name TEXT,
  recording_url TEXT,
  recording_sid TEXT,
  resource_id TEXT,
  channel_name TEXT,
  duration_seconds INTEGER DEFAULT 0,
  file_size_bytes BIGINT DEFAULT 0,
  status TEXT DEFAULT 'recording' CHECK (status IN ('recording', 'processing', 'ready', 'failed', 'expired', 'deleted')),
  started_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  ended_at TIMESTAMP WITH TIME ZONE,
  expires_at TIMESTAMP WITH TIME ZONE DEFAULT (now() + interval '15 days'),
  thumbnail_url TEXT,
  total_viewers INTEGER DEFAULT 0,
  total_gifts INTEGER DEFAULT 0,
  total_coins BIGINT DEFAULT 0,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.stream_recordings ENABLE ROW LEVEL SECURITY;

-- Only admins can view recordings
CREATE POLICY "Admins can view all stream recordings"
ON public.stream_recordings FOR SELECT
USING (public.is_admin(auth.uid()));

-- System can insert/update recordings (for edge functions)
CREATE POLICY "Service can insert recordings"
ON public.stream_recordings FOR INSERT
WITH CHECK (true);

CREATE POLICY "Service can update recordings"
ON public.stream_recordings FOR UPDATE
USING (true);

-- Index for faster searching
CREATE INDEX idx_stream_recordings_host_uid ON public.stream_recordings(host_uid);
CREATE INDEX idx_stream_recordings_host_id ON public.stream_recordings(host_id);
CREATE INDEX idx_stream_recordings_status ON public.stream_recordings(status);
CREATE INDEX idx_stream_recordings_created_at ON public.stream_recordings(created_at DESC);
CREATE INDEX idx_stream_recordings_expires_at ON public.stream_recordings(expires_at);

-- Create table for private call security logs
CREATE TABLE IF NOT EXISTS public.private_call_security_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  call_id UUID REFERENCES public.private_calls(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('screenshot_attempt', 'screen_record_attempt', 'screen_share_attempt', 'app_switch')),
  device_info JSONB DEFAULT '{}',
  detected_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  action_taken TEXT
);

-- Enable RLS
ALTER TABLE public.private_call_security_logs ENABLE ROW LEVEL SECURITY;

-- Only admins can view security logs
CREATE POLICY "Admins can view security logs"
ON public.private_call_security_logs FOR SELECT
USING (public.is_admin(auth.uid()));

-- Allow system to insert logs
CREATE POLICY "System can insert security logs"
ON public.private_call_security_logs FOR INSERT
WITH CHECK (true);

-- Function to auto-delete expired recordings
CREATE OR REPLACE FUNCTION public.cleanup_expired_recordings()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE stream_recordings
  SET status = 'expired'
  WHERE expires_at < now() AND status = 'ready';
  
  -- Optionally delete very old records (30+ days)
  DELETE FROM stream_recordings
  WHERE expires_at < (now() - interval '30 days');
END;
$$;

-- Trigger to update updated_at
CREATE OR REPLACE TRIGGER update_stream_recordings_updated_at
BEFORE UPDATE ON public.stream_recordings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();