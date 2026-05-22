-- Pkg116: LiveKit Realtime Transcription / Captions
-- Adds 'transcription' kill-switch (default OFF, admin opts in) and
-- optional audit/persistence for final transcription segments.

UPDATE public.app_settings
SET setting_value = (
  COALESCE(NULLIF(setting_value, '')::jsonb, '{}'::jsonb)
  || jsonb_build_object('transcription', false)
)::text
WHERE setting_key = 'livekit_signaling_enabled';

INSERT INTO public.app_settings (setting_key, setting_value, description)
SELECT 'livekit_signaling_enabled',
       jsonb_build_object('transcription', false)::text,
       'LiveKit per-feature kill switches'
WHERE NOT EXISTS (
  SELECT 1 FROM public.app_settings WHERE setting_key = 'livekit_signaling_enabled'
);

CREATE TABLE IF NOT EXISTS public.transcription_segments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope text NOT NULL CHECK (scope IN ('call','live','party')),
  scope_id text NOT NULL,
  room_name text NOT NULL,
  participant_identity text,
  segment_id text,
  text text NOT NULL,
  language text,
  is_final boolean NOT NULL DEFAULT true,
  start_time numeric,
  end_time numeric,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_transcription_scope ON public.transcription_segments(scope, scope_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transcription_room ON public.transcription_segments(room_name, created_at DESC);

ALTER TABLE public.transcription_segments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin session full access" ON public.transcription_segments;
CREATE POLICY "Admin session full access" ON public.transcription_segments
  FOR ALL USING (public.is_active_admin_session()) WITH CHECK (public.is_active_admin_session());

-- Hosts can read transcripts of their own live_streams / private_calls / party_rooms
DROP POLICY IF EXISTS "Host reads own room transcripts" ON public.transcription_segments;
CREATE POLICY "Host reads own room transcripts" ON public.transcription_segments
  FOR SELECT USING (
    (scope = 'live' AND EXISTS (
      SELECT 1 FROM public.live_streams ls
      WHERE ls.id::text = scope_id AND ls.host_id = auth.uid()
    ))
    OR (scope = 'party' AND EXISTS (
      SELECT 1 FROM public.party_rooms pr
      WHERE pr.id::text = scope_id AND pr.host_id = auth.uid()
    ))
    OR (scope = 'call' AND EXISTS (
      SELECT 1 FROM public.private_calls pc
      WHERE pc.id::text = scope_id AND (pc.caller_id = auth.uid() OR pc.host_id = auth.uid())
    ))
  );