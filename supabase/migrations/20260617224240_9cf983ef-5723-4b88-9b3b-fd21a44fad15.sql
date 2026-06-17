ALTER TABLE public.live_streams ADD COLUMN IF NOT EXISTS snapshot_egress_id TEXT;
CREATE INDEX IF NOT EXISTS idx_live_streams_active_snapshot ON public.live_streams(is_active) WHERE is_active = true;