-- Reel moderation log for Sightengine NSFW checks
CREATE TABLE IF NOT EXISTS public.reel_moderation_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  reel_id UUID,
  user_id UUID,
  video_url TEXT NOT NULL,
  is_safe BOOLEAN NOT NULL,
  reason TEXT,
  score NUMERIC(5,4) DEFAULT 0,
  details JSONB DEFAULT '{}'::jsonb,
  provider TEXT DEFAULT 'sightengine',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reel_moderation_log_user_id ON public.reel_moderation_log(user_id);
CREATE INDEX IF NOT EXISTS idx_reel_moderation_log_reel_id ON public.reel_moderation_log(reel_id);
CREATE INDEX IF NOT EXISTS idx_reel_moderation_log_is_safe ON public.reel_moderation_log(is_safe);
CREATE INDEX IF NOT EXISTS idx_reel_moderation_log_created_at ON public.reel_moderation_log(created_at DESC);

ALTER TABLE public.reel_moderation_log ENABLE ROW LEVEL SECURITY;

-- Users can view their own moderation results
CREATE POLICY "Users view own moderation log"
ON public.reel_moderation_log
FOR SELECT
USING (auth.uid() = user_id);

-- Admins can view everything via existing is_admin function
CREATE POLICY "Admins view all moderation log"
ON public.reel_moderation_log
FOR SELECT
USING (public.is_admin(auth.uid()));

-- Only edge functions (service role) insert; no anon insert policy needed