
CREATE TABLE IF NOT EXISTS public.live_raise_hand_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stream_id UUID NOT NULL REFERENCES public.live_streams(id) ON DELETE CASCADE,
  viewer_id UUID NOT NULL,
  viewer_name TEXT,
  viewer_avatar TEXT,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','cancelled')),
  raised_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  resolved_by UUID,
  UNIQUE (stream_id, viewer_id)
);

CREATE INDEX IF NOT EXISTS idx_live_raise_hand_stream_status ON public.live_raise_hand_queue (stream_id, status, raised_at);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.live_raise_hand_queue TO authenticated;
GRANT ALL ON public.live_raise_hand_queue TO service_role;

ALTER TABLE public.live_raise_hand_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Viewers manage own raise-hand row"
  ON public.live_raise_hand_queue
  FOR ALL
  TO authenticated
  USING (auth.uid() = viewer_id)
  WITH CHECK (auth.uid() = viewer_id);

CREATE POLICY "Host reads own stream queue"
  ON public.live_raise_hand_queue
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.live_streams s
      WHERE s.id = stream_id AND s.host_id = auth.uid()
    )
  );

CREATE POLICY "Host updates own stream queue"
  ON public.live_raise_hand_queue
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.live_streams s
      WHERE s.id = stream_id AND s.host_id = auth.uid()
    )
  );

ALTER PUBLICATION supabase_realtime ADD TABLE public.live_raise_hand_queue;
