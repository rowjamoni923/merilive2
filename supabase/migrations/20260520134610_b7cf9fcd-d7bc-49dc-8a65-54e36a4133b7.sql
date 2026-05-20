-- =========================================================
-- Pkg59: Live/Call/Party DB-read + billing cost monitor
-- =========================================================

-- 1) Sample storage (insert-only, append-log style)
CREATE TABLE IF NOT EXISTS public.cost_monitor_samples (
  id bigserial PRIMARY KEY,
  sampled_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL,    -- live_streams|private_calls|party_rooms|profiles|agencies|gift_transactions|balance_audit_log|live|call|party|billing|realtime
  metric text NOT NULL,    -- reads_per_min|rows_fetched_per_min|active|beans_per_min|gifts_per_min|events_per_hour
  value bigint NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_cost_monitor_samples_recent
  ON public.cost_monitor_samples (sampled_at DESC);
CREATE INDEX IF NOT EXISTS idx_cost_monitor_samples_source_metric
  ON public.cost_monitor_samples (source, metric, sampled_at DESC);

ALTER TABLE public.cost_monitor_samples ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin session full access" ON public.cost_monitor_samples;
CREATE POLICY "Admin session full access" ON public.cost_monitor_samples
  FOR ALL USING (public.is_active_admin_session())
  WITH CHECK (public.is_active_admin_session());

-- 2) Per-table cumulative snapshot (for delta calculation)
CREATE TABLE IF NOT EXISTS public.cost_monitor_snapshots (
  table_name text PRIMARY KEY,
  seq_scan bigint NOT NULL DEFAULT 0,
  idx_scan bigint NOT NULL DEFAULT 0,
  tup_returned bigint NOT NULL DEFAULT 0,
  snapshot_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.cost_monitor_snapshots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin session full access" ON public.cost_monitor_snapshots;
CREATE POLICY "Admin session full access" ON public.cost_monitor_snapshots
  FOR ALL USING (public.is_active_admin_session())
  WITH CHECK (public.is_active_admin_session());

-- 3) Alerts log
CREATE TABLE IF NOT EXISTS public.cost_monitor_alerts (
  id bigserial PRIMARY KEY,
  triggered_at timestamptz NOT NULL DEFAULT now(),
  severity text NOT NULL DEFAULT 'warn',  -- warn | critical
  source text NOT NULL,
  metric text NOT NULL,
  value bigint NOT NULL,
  threshold bigint NOT NULL,
  message text NOT NULL,
  acknowledged_at timestamptz,
  acknowledged_by uuid
);
CREATE INDEX IF NOT EXISTS idx_cost_monitor_alerts_recent
  ON public.cost_monitor_alerts (triggered_at DESC);
ALTER TABLE public.cost_monitor_alerts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin session full access" ON public.cost_monitor_alerts;
CREATE POLICY "Admin session full access" ON public.cost_monitor_alerts
  FOR ALL USING (public.is_active_admin_session())
  WITH CHECK (public.is_active_admin_session());

-- 4) Default thresholds (admin-editable via app_settings)
INSERT INTO public.app_settings(setting_key, setting_value, description)
VALUES (
  'cost_monitor_thresholds',
  '{"reads_per_min_per_table":50000,"rows_fetched_per_min_per_table":2000000,"beans_per_min":5000000,"gifts_per_min":2000,"events_per_hour":40000,"active_calls":2000,"active_lives":1500,"active_parties":1500}'::text,
  'Pkg59 cost-monitor alert thresholds — edit live to tune sensitivity'
)
ON CONFLICT (setting_key) DO NOTHING;

-- 5) Sampler — runs every minute via pg_cron
CREATE OR REPLACE FUNCTION public.sample_cost_monitor()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  watched_tables text[] := ARRAY[
    'live_streams','private_calls','party_rooms',
    'profiles','agencies','gift_transactions','balance_audit_log'
  ];
  t text;
  cur_seq bigint; cur_idx bigint; cur_ret bigint;
  prev_seq bigint; prev_idx bigint; prev_ret bigint;
  delta_reads bigint; delta_returned bigint;
  v_active_live bigint; v_active_call bigint; v_active_party bigint;
  v_beans bigint; v_gifts bigint; v_events bigint;
  v_thresholds jsonb;
BEGIN
  -- read latest cumulative stats from pg_stat_user_tables, compute per-minute deltas
  FOREACH t IN ARRAY watched_tables LOOP
    SELECT COALESCE(s.seq_scan,0),
           COALESCE(s.idx_scan,0),
           COALESCE(s.seq_tup_read,0) + COALESCE(s.idx_tup_fetch,0)
      INTO cur_seq, cur_idx, cur_ret
    FROM pg_stat_user_tables s
    WHERE s.schemaname='public' AND s.relname=t;

    IF cur_seq IS NULL THEN CONTINUE; END IF;

    SELECT seq_scan, idx_scan, tup_returned
      INTO prev_seq, prev_idx, prev_ret
    FROM public.cost_monitor_snapshots WHERE table_name=t;

    IF prev_seq IS NOT NULL THEN
      delta_reads    := GREATEST(0, (cur_seq + cur_idx) - (prev_seq + prev_idx));
      delta_returned := GREATEST(0, cur_ret - prev_ret);
      INSERT INTO public.cost_monitor_samples(source, metric, value)
      VALUES (t, 'reads_per_min',        delta_reads),
             (t, 'rows_fetched_per_min', delta_returned);
    END IF;

    INSERT INTO public.cost_monitor_snapshots(table_name, seq_scan, idx_scan, tup_returned, snapshot_at)
    VALUES (t, cur_seq, cur_idx, cur_ret, now())
    ON CONFLICT (table_name) DO UPDATE
      SET seq_scan=EXCLUDED.seq_scan,
          idx_scan=EXCLUDED.idx_scan,
          tup_returned=EXCLUDED.tup_returned,
          snapshot_at=EXCLUDED.snapshot_at;
  END LOOP;

  -- Active workload counters
  SELECT count(*) INTO v_active_live  FROM public.live_streams
   WHERE COALESCE(is_active,false)=true OR (ended_at IS NULL AND status IN ('live','active','streaming'));
  SELECT count(*) INTO v_active_call  FROM public.private_calls
   WHERE status IN ('ongoing','active','answered','ringing','connecting');
  SELECT count(*) INTO v_active_party FROM public.party_rooms
   WHERE COALESCE(is_active,false)=true AND ended_at IS NULL;

  INSERT INTO public.cost_monitor_samples(source, metric, value) VALUES
    ('live',  'active', v_active_live),
    ('call',  'active', v_active_call),
    ('party', 'active', v_active_party);

  -- Billing throughput last minute
  SELECT COALESCE(sum(ABS(delta)),0) INTO v_beans
    FROM public.balance_audit_log
    WHERE created_at >= now() - interval '1 minute'
      AND column_name IN ('beans','beans_balance');
  SELECT count(*) INTO v_gifts
    FROM public.gift_transactions
    WHERE created_at >= now() - interval '1 minute';

  INSERT INTO public.cost_monitor_samples(source, metric, value) VALUES
    ('billing', 'beans_per_min', v_beans),
    ('billing', 'gifts_per_min', v_gifts);

  -- Realtime broadcast events (Pkg53 counter, hourly bucket)
  SELECT COALESCE(event_count,0) INTO v_events
    FROM public.admin_broadcast_rate_counter
    ORDER BY bucket_hour DESC LIMIT 1;
  INSERT INTO public.cost_monitor_samples(source, metric, value)
  VALUES ('realtime', 'events_per_hour', COALESCE(v_events,0));

  -- ===== Threshold evaluation → cost_monitor_alerts =====
  SELECT (setting_value)::jsonb INTO v_thresholds
    FROM public.app_settings WHERE setting_key='cost_monitor_thresholds';

  IF v_thresholds IS NOT NULL THEN
    -- per-table reads
    INSERT INTO public.cost_monitor_alerts(severity, source, metric, value, threshold, message)
    SELECT 'warn', t2, 'reads_per_min', delta_v, (v_thresholds->>'reads_per_min_per_table')::bigint,
           format('High DB read rate on %s: %s reads/min (threshold %s)', t2, delta_v, v_thresholds->>'reads_per_min_per_table')
    FROM (
      SELECT source AS t2, value AS delta_v
      FROM public.cost_monitor_samples
      WHERE sampled_at >= now() - interval '90 seconds'
        AND metric = 'reads_per_min'
    ) x
    WHERE delta_v > (v_thresholds->>'reads_per_min_per_table')::bigint
      AND NOT EXISTS (
        SELECT 1 FROM public.cost_monitor_alerts a
        WHERE a.source=t2 AND a.metric='reads_per_min'
          AND a.triggered_at >= now() - interval '15 minutes'
      );

    -- realtime events_per_hour
    IF v_events > (v_thresholds->>'events_per_hour')::bigint
       AND NOT EXISTS (
         SELECT 1 FROM public.cost_monitor_alerts
         WHERE source='realtime' AND metric='events_per_hour'
           AND triggered_at >= now() - interval '30 minutes'
       ) THEN
      INSERT INTO public.cost_monitor_alerts(severity, source, metric, value, threshold, message)
      VALUES ('critical','realtime','events_per_hour', v_events, (v_thresholds->>'events_per_hour')::bigint,
              format('Realtime events spiking: %s/hour (threshold %s) — Pkg53 kill-switch may auto-trip', v_events, v_thresholds->>'events_per_hour'));
    END IF;

    -- beans/min
    IF v_beans > (v_thresholds->>'beans_per_min')::bigint
       AND NOT EXISTS (
         SELECT 1 FROM public.cost_monitor_alerts
         WHERE source='billing' AND metric='beans_per_min'
           AND triggered_at >= now() - interval '15 minutes'
       ) THEN
      INSERT INTO public.cost_monitor_alerts(severity, source, metric, value, threshold, message)
      VALUES ('warn','billing','beans_per_min', v_beans, (v_thresholds->>'beans_per_min')::bigint,
              format('Beans throughput high: %s/min (threshold %s)', v_beans, v_thresholds->>'beans_per_min'));
    END IF;
  END IF;

  -- retention
  DELETE FROM public.cost_monitor_samples WHERE sampled_at < now() - interval '7 days';
  DELETE FROM public.cost_monitor_alerts  WHERE triggered_at < now() - interval '30 days';
END;
$$;

GRANT EXECUTE ON FUNCTION public.sample_cost_monitor() TO postgres;

-- 6) pg_cron: every minute
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname='pg_cron') THEN
    PERFORM cron.unschedule('cost-monitor-sample')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='cost-monitor-sample');
    PERFORM cron.schedule(
      'cost-monitor-sample',
      '* * * * *',
      $cron$ SELECT public.sample_cost_monitor(); $cron$
    );
  END IF;
END $$;

-- 7) Read-side RPC for the admin UI
CREATE OR REPLACE FUNCTION public.admin_cost_monitor_stats(_hours int DEFAULT 1)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hours int := GREATEST(1, LEAST(COALESCE(_hours,1), 168));
  v_result jsonb;
  v_kill text;
BEGIN
  IF NOT public.is_active_admin_session() THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  SELECT setting_value INTO v_kill
    FROM public.app_settings WHERE setting_key='realtime_admin_broadcast_enabled';

  WITH recent AS (
    SELECT source, metric, value, sampled_at
    FROM public.cost_monitor_samples
    WHERE sampled_at >= now() - make_interval(hours => v_hours)
  ),
  latest AS (
    SELECT DISTINCT ON (source, metric)
      source, metric, value, sampled_at
    FROM recent
    ORDER BY source, metric, sampled_at DESC
  ),
  agg AS (
    SELECT source, metric,
           sum(value)::bigint AS total,
           max(value)::bigint AS peak,
           avg(value)::bigint AS avg_v
    FROM recent
    WHERE metric LIKE '%_per_min' OR metric = 'events_per_hour'
    GROUP BY source, metric
  ),
  series AS (
    SELECT source, metric,
      jsonb_agg(jsonb_build_object('t', extract(epoch from sampled_at)::bigint, 'v', value)
                ORDER BY sampled_at) AS points
    FROM recent
    GROUP BY source, metric
  )
  SELECT jsonb_build_object(
    'latest',            COALESCE((SELECT jsonb_agg(to_jsonb(l)) FROM latest l), '[]'::jsonb),
    'aggregates',        COALESCE((SELECT jsonb_agg(to_jsonb(a)) FROM agg a),    '[]'::jsonb),
    'series',            COALESCE((SELECT jsonb_agg(to_jsonb(s)) FROM series s), '[]'::jsonb),
    'realtime_kill_switch_enabled', (v_kill IS NULL OR v_kill IN ('true','"true"','True')),
    'broadcast_events_this_hour',   (SELECT COALESCE(event_count,0) FROM public.admin_broadcast_rate_counter ORDER BY bucket_hour DESC LIMIT 1),
    'recent_alerts',     COALESCE((
        SELECT jsonb_agg(to_jsonb(a) ORDER BY a.triggered_at DESC)
        FROM (
          SELECT id, triggered_at, severity, source, metric, value, threshold, message, acknowledged_at
          FROM public.cost_monitor_alerts
          ORDER BY triggered_at DESC
          LIMIT 50
        ) a
      ), '[]'::jsonb),
    'thresholds',        (SELECT setting_value::jsonb FROM public.app_settings WHERE setting_key='cost_monitor_thresholds'),
    'sampled_at',        to_jsonb(now())
  ) INTO v_result;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_cost_monitor_stats(int) TO authenticated, anon;

-- 8) Acknowledge alert RPC
CREATE OR REPLACE FUNCTION public.admin_cost_monitor_ack_alert(_id bigint)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_active_admin_session() THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;
  UPDATE public.cost_monitor_alerts
     SET acknowledged_at = now(),
         acknowledged_by = auth.uid()
   WHERE id = _id AND acknowledged_at IS NULL;
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_cost_monitor_ack_alert(bigint) TO authenticated, anon;

-- 9) Broadcast triggers so admin UI auto-refreshes (Pkg37+Pkg53 throttle applies)
DROP TRIGGER IF EXISTS tg_cost_monitor_samples_bcast ON public.cost_monitor_samples;
CREATE TRIGGER tg_cost_monitor_samples_bcast
AFTER INSERT ON public.cost_monitor_samples
FOR EACH STATEMENT
EXECUTE FUNCTION public.tg_admin_broadcast_bump('cost_monitor_samples');

DROP TRIGGER IF EXISTS tg_cost_monitor_alerts_bcast ON public.cost_monitor_alerts;
CREATE TRIGGER tg_cost_monitor_alerts_bcast
AFTER INSERT OR UPDATE ON public.cost_monitor_alerts
FOR EACH STATEMENT
EXECUTE FUNCTION public.tg_admin_broadcast_bump('cost_monitor_alerts');

-- 10) Run one sample immediately so the dashboard has data on first load
SELECT public.sample_cost_monitor();