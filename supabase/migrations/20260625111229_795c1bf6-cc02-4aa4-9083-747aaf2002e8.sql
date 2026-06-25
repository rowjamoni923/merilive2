
-- =====================================================================
-- RANDOM MATCH CALL FOUNDATION
-- =====================================================================

-- 1. SETTINGS (admin-editable singleton; id=1 row)
CREATE TABLE IF NOT EXISTS public.random_call_settings (
  id INT PRIMARY KEY DEFAULT 1,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  min_billable_seconds INT NOT NULL DEFAULT 40,
  free_trial_seconds INT NOT NULL DEFAULT 90,
  host_split_pct NUMERIC(5,4) NOT NULL DEFAULT 0.60,
  host_min_rate_coins_per_min INT NOT NULL DEFAULT 1200,
  host_max_rate_coins_per_min INT NOT NULL DEFAULT 20000,
  default_host_rate_coins_per_min INT NOT NULL DEFAULT 2000,
  ring_timeout_seconds INT NOT NULL DEFAULT 15,
  match_timeout_seconds INT NOT NULL DEFAULT 300,
  price_change_cooldown_seconds INT NOT NULL DEFAULT 3600,
  daily_skip_limit INT NOT NULL DEFAULT 30,
  skip_cooldown_seconds INT NOT NULL DEFAULT 3,
  flash_disconnect_threshold INT NOT NULL DEFAULT 3,
  flash_disconnect_window_seconds INT NOT NULL DEFAULT 3600,
  flash_disconnect_cooldown_minutes INT NOT NULL DEFAULT 30,
  vip_match_priority_multiplier NUMERIC(4,2) NOT NULL DEFAULT 2.5,
  vip_free_trial_bonus_seconds INT NOT NULL DEFAULT 30,
  enable_country_filter BOOLEAN NOT NULL DEFAULT true,
  country_filter_requires_vip BOOLEAN NOT NULL DEFAULT false,
  enable_gender_filter BOOLEAN NOT NULL DEFAULT true,
  min_host_level_for_pool INT NOT NULL DEFAULT 1,
  preauth_minutes_hold INT NOT NULL DEFAULT 2,
  livekit_room_max_seconds INT NOT NULL DEFAULT 3600,
  coins_to_usd_rate INT NOT NULL DEFAULT 10000,
  beans_to_usd_rate INT NOT NULL DEFAULT 10000,
  updated_by UUID,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT random_call_settings_singleton CHECK (id = 1)
);

GRANT SELECT ON public.random_call_settings TO anon, authenticated;
GRANT ALL ON public.random_call_settings TO service_role;

ALTER TABLE public.random_call_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rc_settings_read_all"
  ON public.random_call_settings FOR SELECT
  USING (true);

CREATE POLICY "rc_settings_admin_write"
  ON public.random_call_settings FOR ALL
  USING (EXISTS (SELECT 1 FROM public.admin_users a WHERE a.user_id = auth.uid() AND a.is_active = true))
  WITH CHECK (EXISTS (SELECT 1 FROM public.admin_users a WHERE a.user_id = auth.uid() AND a.is_active = true));

-- Seed singleton
INSERT INTO public.random_call_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- =====================================================================
-- 2. HOST MATCH PREFERENCES
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.host_match_preferences (
  host_id UUID PRIMARY KEY,
  is_in_match_pool BOOLEAN NOT NULL DEFAULT false,
  coin_rate_per_min INT NOT NULL DEFAULT 2000,
  rate_changed_at TIMESTAMPTZ,
  preferred_caller_langs TEXT[] DEFAULT '{}',
  preferred_caller_countries TEXT[] DEFAULT '{}',
  auto_accept_calls BOOLEAN NOT NULL DEFAULT true,
  min_caller_level INT NOT NULL DEFAULT 0,
  blocked_user_ids UUID[] DEFAULT '{}',
  total_calls INT NOT NULL DEFAULT 0,
  total_beans_earned BIGINT NOT NULL DEFAULT 0,
  flash_disconnects_count INT NOT NULL DEFAULT 0,
  flash_disconnect_window_start TIMESTAMPTZ,
  flash_disconnect_cooldown_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.host_match_preferences TO anon;
GRANT SELECT, INSERT, UPDATE ON public.host_match_preferences TO authenticated;
GRANT ALL ON public.host_match_preferences TO service_role;

ALTER TABLE public.host_match_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hmp_read_all_basic"
  ON public.host_match_preferences FOR SELECT USING (true);

CREATE POLICY "hmp_owner_write"
  ON public.host_match_preferences FOR ALL
  USING (auth.uid() = host_id)
  WITH CHECK (auth.uid() = host_id);

CREATE POLICY "hmp_admin_write"
  ON public.host_match_preferences FOR ALL
  USING (EXISTS (SELECT 1 FROM public.admin_users a WHERE a.user_id = auth.uid() AND a.is_active = true))
  WITH CHECK (EXISTS (SELECT 1 FROM public.admin_users a WHERE a.user_id = auth.uid() AND a.is_active = true));

-- =====================================================================
-- 3. MATCH QUEUE
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.random_call_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('caller','host')),
  gender TEXT,
  preferred_langs TEXT[] DEFAULT '{}',
  preferred_country TEXT,
  is_vip BOOLEAN NOT NULL DEFAULT false,
  score INT NOT NULL DEFAULT 0,
  coin_rate_per_min INT,
  hold_amount BIGINT DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'waiting'
    CHECK (status IN ('waiting','matched','cancelled','expired')),
  matched_with UUID,
  session_id UUID,
  entered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rcq_match_lookup
  ON public.random_call_queue(role, status, score DESC, entered_at ASC)
  WHERE status = 'waiting';

CREATE INDEX IF NOT EXISTS idx_rcq_user_active
  ON public.random_call_queue(user_id, status);

GRANT SELECT ON public.random_call_queue TO authenticated;
GRANT ALL ON public.random_call_queue TO service_role;

ALTER TABLE public.random_call_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rcq_own_read"
  ON public.random_call_queue FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "rcq_admin_read"
  ON public.random_call_queue FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.admin_users a WHERE a.user_id = auth.uid() AND a.is_active = true));

-- =====================================================================
-- 4. SESSIONS
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.random_call_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  livekit_room TEXT UNIQUE NOT NULL,
  caller_id UUID NOT NULL,
  host_id UUID NOT NULL,
  coin_rate_per_min INT NOT NULL,
  free_trial_seconds INT NOT NULL DEFAULT 90,
  min_billable_seconds INT NOT NULL DEFAULT 40,
  host_split_pct NUMERIC(5,4) NOT NULL DEFAULT 0.60,
  hold_amount BIGINT NOT NULL DEFAULT 0,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  accepted_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  duration_seconds INT,
  billable_seconds INT,
  coins_charged BIGINT NOT NULL DEFAULT 0,
  beans_awarded BIGINT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'ringing'
    CHECK (status IN ('ringing','active','completed','sub_minimum','aborted','no_answer')),
  ended_by TEXT,
  caller_rating INT,
  host_rating INT,
  settled BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rcs_caller ON public.random_call_sessions(caller_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_rcs_host   ON public.random_call_sessions(host_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_rcs_status ON public.random_call_sessions(status) WHERE status IN ('ringing','active');

GRANT SELECT ON public.random_call_sessions TO authenticated;
GRANT ALL ON public.random_call_sessions TO service_role;

ALTER TABLE public.random_call_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rcs_participant_read"
  ON public.random_call_sessions FOR SELECT
  USING (auth.uid() = caller_id OR auth.uid() = host_id);

CREATE POLICY "rcs_admin_read"
  ON public.random_call_sessions FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.admin_users a WHERE a.user_id = auth.uid() AND a.is_active = true));

-- =====================================================================
-- 5. SKIP COUNTERS
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.random_call_skip_counters (
  user_id UUID NOT NULL,
  day_bucket DATE NOT NULL DEFAULT CURRENT_DATE,
  skip_count INT NOT NULL DEFAULT 0,
  last_skip_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, day_bucket)
);

GRANT SELECT ON public.random_call_skip_counters TO authenticated;
GRANT ALL ON public.random_call_skip_counters TO service_role;

ALTER TABLE public.random_call_skip_counters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rcsk_own_read"
  ON public.random_call_skip_counters FOR SELECT
  USING (auth.uid() = user_id);

-- =====================================================================
-- 6. RPC: claim_match (atomic, SKIP LOCKED)
-- =====================================================================
CREATE OR REPLACE FUNCTION public.claim_match(
  p_caller_queue_id UUID
) RETURNS UUID AS $$
DECLARE
  v_caller RECORD;
  v_host_queue_id UUID;
  v_host_user_id UUID;
BEGIN
  SELECT * INTO v_caller FROM public.random_call_queue
    WHERE id = p_caller_queue_id AND status = 'waiting'
    FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT id, user_id INTO v_host_queue_id, v_host_user_id
  FROM public.random_call_queue
  WHERE role = 'host'
    AND status = 'waiting'
    AND user_id <> v_caller.user_id
    AND (
      v_caller.preferred_country IS NULL
      OR preferred_country IS NULL
      OR preferred_country = v_caller.preferred_country
    )
  ORDER BY score DESC, entered_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF v_host_queue_id IS NULL THEN RETURN NULL; END IF;

  UPDATE public.random_call_queue
    SET status = 'matched', matched_with = v_caller.user_id, updated_at = now()
    WHERE id = v_host_queue_id;
  UPDATE public.random_call_queue
    SET status = 'matched', matched_with = v_host_user_id, updated_at = now()
    WHERE id = p_caller_queue_id;

  RETURN v_host_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.claim_match(UUID) TO service_role;

-- =====================================================================
-- 7. RPC: settle_random_call (40-second rule enforcement)
-- =====================================================================
CREATE OR REPLACE FUNCTION public.settle_random_call(
  p_session_id UUID,
  p_duration_seconds INT,
  p_ended_by TEXT
) RETURNS jsonb AS $$
DECLARE
  v_s RECORD;
  v_settings RECORD;
  v_billable INT;
  v_coins BIGINT;
  v_beans BIGINT;
  v_status TEXT;
  v_window_start TIMESTAMPTZ;
BEGIN
  SELECT * INTO v_s FROM public.random_call_sessions
    WHERE id = p_session_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'session_not_found');
  END IF;
  IF v_s.settled THEN
    RETURN jsonb_build_object('ok', true, 'already_settled', true);
  END IF;

  SELECT * INTO v_settings FROM public.random_call_settings WHERE id = 1;

  -- Sub-minimum: < 40s billable AFTER free trial = no charge, no earnings
  IF p_duration_seconds < v_s.min_billable_seconds THEN
    v_status := 'sub_minimum';
    v_coins := 0;
    v_beans := 0;
    v_billable := 0;

    -- Flash-disconnect penalty if host ended the call early
    IF p_ended_by = 'host' THEN
      SELECT flash_disconnect_window_start INTO v_window_start
        FROM public.host_match_preferences WHERE host_id = v_s.host_id;
      IF v_window_start IS NULL
         OR v_window_start < (now() - (v_settings.flash_disconnect_window_seconds || ' seconds')::INTERVAL) THEN
        UPDATE public.host_match_preferences
          SET flash_disconnects_count = 1,
              flash_disconnect_window_start = now(),
              updated_at = now()
          WHERE host_id = v_s.host_id;
      ELSE
        UPDATE public.host_match_preferences
          SET flash_disconnects_count = flash_disconnects_count + 1,
              updated_at = now(),
              flash_disconnect_cooldown_until = CASE
                WHEN flash_disconnects_count + 1 >= v_settings.flash_disconnect_threshold
                THEN now() + (v_settings.flash_disconnect_cooldown_minutes || ' minutes')::INTERVAL
                ELSE flash_disconnect_cooldown_until
              END
          WHERE host_id = v_s.host_id;
      END IF;
    END IF;
  ELSE
    v_billable := GREATEST(0, p_duration_seconds - v_s.free_trial_seconds);
    v_coins := CEIL((v_billable::NUMERIC / 60.0) * v_s.coin_rate_per_min)::BIGINT;
    v_beans := FLOOR(v_coins * v_s.host_split_pct)::BIGINT;
    v_status := 'completed';

    -- Wallet movement (best-effort: profiles.coins / profiles.beans if present)
    UPDATE public.profiles
      SET coins = GREATEST(0, COALESCE(coins, 0) - v_coins)
      WHERE id = v_s.caller_id;
    UPDATE public.profiles
      SET beans = COALESCE(beans, 0) + v_beans
      WHERE id = v_s.host_id;
  END IF;

  UPDATE public.random_call_sessions
    SET status = v_status,
        duration_seconds = p_duration_seconds,
        billable_seconds = v_billable,
        coins_charged = v_coins,
        beans_awarded = v_beans,
        ended_by = p_ended_by,
        ended_at = COALESCE(ended_at, now()),
        settled = true,
        updated_at = now()
    WHERE id = p_session_id;

  UPDATE public.host_match_preferences
    SET total_calls = total_calls + 1,
        total_beans_earned = total_beans_earned + v_beans,
        updated_at = now()
    WHERE host_id = v_s.host_id;

  RETURN jsonb_build_object(
    'ok', true,
    'status', v_status,
    'duration_seconds', p_duration_seconds,
    'billable_seconds', v_billable,
    'coins_charged', v_coins,
    'beans_awarded', v_beans
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.settle_random_call(UUID, INT, TEXT) TO service_role;

-- =====================================================================
-- 8. Realtime
-- =====================================================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.random_call_queue;
ALTER PUBLICATION supabase_realtime ADD TABLE public.random_call_sessions;
