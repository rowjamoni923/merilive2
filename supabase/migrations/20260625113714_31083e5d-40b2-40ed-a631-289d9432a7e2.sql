
-- ============ 1. Extend random_call_settings ============
ALTER TABLE public.random_call_settings
  ADD COLUMN IF NOT EXISTS grace_cancel_seconds INT NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS free_preview_seconds INT NOT NULL DEFAULT 40,
  ADD COLUMN IF NOT EXISTS skip_soft_trigger_count INT NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS skip_soft_window_seconds INT NOT NULL DEFAULT 60,
  ADD COLUMN IF NOT EXISTS skip_soft_cooldown_seconds INT NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS skip_extended_trigger_count INT NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS skip_extended_window_seconds INT NOT NULL DEFAULT 300,
  ADD COLUMN IF NOT EXISTS skip_extended_cooldown_seconds INT NOT NULL DEFAULT 60,
  ADD COLUMN IF NOT EXISTS vip_skip_cooldown_multiplier NUMERIC NOT NULL DEFAULT 0.5,
  ADD COLUMN IF NOT EXISTS svip_skip_cooldown_multiplier NUMERIC NOT NULL DEFAULT 0.25,
  ADD COLUMN IF NOT EXISTS queue_resort_interval_seconds INT NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS same_pair_block_minutes INT NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS reconnect_window_seconds INT NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS host_idle_timeout_seconds INT NOT NULL DEFAULT 300,
  ADD COLUMN IF NOT EXISTS host_min_acceptance_pct INT NOT NULL DEFAULT 40,
  ADD COLUMN IF NOT EXISTS host_max_acceptance_pct INT NOT NULL DEFAULT 95,
  ADD COLUMN IF NOT EXISTS report_suspend_threshold INT NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS report_suspend_hours INT NOT NULL DEFAULT 12,
  ADD COLUMN IF NOT EXISTS auto_on_when_live BOOLEAN NOT NULL DEFAULT TRUE;

-- ============ 2. host_match_availability ============
CREATE TABLE IF NOT EXISTS public.host_match_availability (
  host_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  is_available BOOLEAN NOT NULL DEFAULT FALSE,
  auto_on_when_live BOOLEAN NOT NULL DEFAULT TRUE,
  preferred_caller_gender TEXT,
  accepts_countries TEXT[],
  accepts_languages TEXT[],
  last_active_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  turned_on_at TIMESTAMPTZ,
  turned_off_at TIMESTAMPTZ,
  suspended_until TIMESTAMPTZ,
  suspension_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.host_match_availability TO authenticated;
GRANT ALL ON public.host_match_availability TO service_role;

ALTER TABLE public.host_match_availability ENABLE ROW LEVEL SECURITY;

CREATE POLICY "host can read own availability"
  ON public.host_match_availability FOR SELECT TO authenticated
  USING (host_id = auth.uid());

CREATE POLICY "host can upsert own availability"
  ON public.host_match_availability FOR INSERT TO authenticated
  WITH CHECK (host_id = auth.uid());

CREATE POLICY "host can update own availability"
  ON public.host_match_availability FOR UPDATE TO authenticated
  USING (host_id = auth.uid())
  WITH CHECK (host_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_host_match_avail_available
  ON public.host_match_availability(is_available, last_active_at)
  WHERE is_available = TRUE;

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.touch_host_match_availability()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;$$;

DROP TRIGGER IF EXISTS trg_touch_host_match_avail ON public.host_match_availability;
CREATE TRIGGER trg_touch_host_match_avail
  BEFORE UPDATE ON public.host_match_availability
  FOR EACH ROW EXECUTE FUNCTION public.touch_host_match_availability();

-- ============ 3. recent_match_pairs ============
CREATE TABLE IF NOT EXISTS public.recent_match_pairs (
  user_a UUID NOT NULL,
  user_b UUID NOT NULL,
  matched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  match_id UUID,
  PRIMARY KEY (user_a, user_b, matched_at),
  CONSTRAINT pair_order CHECK (user_a < user_b)
);

GRANT ALL ON public.recent_match_pairs TO service_role;
-- no authenticated grant: server-only

ALTER TABLE public.recent_match_pairs ENABLE ROW LEVEL SECURITY;
-- (no policies = no client access; service_role bypasses RLS)

CREATE INDEX IF NOT EXISTS idx_recent_match_pairs_at
  ON public.recent_match_pairs(matched_at DESC);

CREATE OR REPLACE FUNCTION public.random_match_record_pair(_a UUID, _b UUID, _match_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.recent_match_pairs(user_a, user_b, match_id)
  VALUES (LEAST(_a,_b), GREATEST(_a,_b), _match_id)
  ON CONFLICT DO NOTHING;
END;$$;

-- ============ 4. host_match_stats ============
CREATE TABLE IF NOT EXISTS public.host_match_stats (
  host_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  -- rolling 7-day counters
  rings_received_7d INT NOT NULL DEFAULT 0,
  rings_accepted_7d INT NOT NULL DEFAULT 0,
  rings_rejected_7d INT NOT NULL DEFAULT 0,
  rings_timeout_7d INT NOT NULL DEFAULT 0,
  calls_completed_7d INT NOT NULL DEFAULT 0,
  calls_short_7d INT NOT NULL DEFAULT 0,   -- ended < free_preview
  avg_duration_sec_7d NUMERIC NOT NULL DEFAULT 0,
  avg_rating_7d NUMERIC NOT NULL DEFAULT 0,
  rating_count_7d INT NOT NULL DEFAULT 0,
  report_count_24h INT NOT NULL DEFAULT 0,
  acceptance_pct NUMERIC GENERATED ALWAYS AS (
    CASE WHEN rings_received_7d > 0
      THEN ROUND(100.0 * rings_accepted_7d / rings_received_7d, 2)
      ELSE 0 END
  ) STORED,
  quality_score NUMERIC NOT NULL DEFAULT 0,  -- 0..1 composite
  is_queue_suppressed BOOLEAN NOT NULL DEFAULT FALSE,
  suppressed_reason TEXT,
  last_recomputed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.host_match_stats TO authenticated;
GRANT ALL ON public.host_match_stats TO service_role;

ALTER TABLE public.host_match_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anyone signed in can read host match stats"
  ON public.host_match_stats FOR SELECT TO authenticated USING (true);

DROP TRIGGER IF EXISTS trg_touch_host_match_stats ON public.host_match_stats;
CREATE TRIGGER trg_touch_host_match_stats
  BEFORE UPDATE ON public.host_match_stats
  FOR EACH ROW EXECUTE FUNCTION public.touch_host_match_availability();

-- ============ 5. helper: touch host availability ============
CREATE OR REPLACE FUNCTION public.random_match_touch_host_availability(_host_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.host_match_availability(host_id, is_available, last_active_at, turned_on_at)
  VALUES (_host_id, TRUE, now(), now())
  ON CONFLICT (host_id) DO UPDATE
    SET last_active_at = now(),
        is_available = TRUE,
        turned_on_at = COALESCE(public.host_match_availability.turned_on_at, now()),
        turned_off_at = NULL;
END;$$;

CREATE OR REPLACE FUNCTION public.random_match_set_host_availability(_host_id UUID, _on BOOLEAN)
RETURNS public.host_match_availability LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.host_match_availability;
BEGIN
  INSERT INTO public.host_match_availability(host_id, is_available, last_active_at, turned_on_at, turned_off_at)
  VALUES (_host_id, _on, now(),
          CASE WHEN _on THEN now() ELSE NULL END,
          CASE WHEN _on THEN NULL ELSE now() END)
  ON CONFLICT (host_id) DO UPDATE
    SET is_available = _on,
        last_active_at = now(),
        turned_on_at = CASE WHEN _on THEN now() ELSE public.host_match_availability.turned_on_at END,
        turned_off_at = CASE WHEN _on THEN NULL ELSE now() END
  RETURNING * INTO r;
  RETURN r;
END;$$;

GRANT EXECUTE ON FUNCTION public.random_match_touch_host_availability(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.random_match_set_host_availability(UUID, BOOLEAN) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.random_match_record_pair(UUID, UUID, UUID) TO service_role;
