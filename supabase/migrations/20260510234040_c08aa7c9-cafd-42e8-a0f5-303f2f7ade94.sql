CREATE TABLE IF NOT EXISTS public.live_face_warnings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  host_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  stream_id uuid NOT NULL,
  session_type text NOT NULL DEFAULT 'live',
  event text NOT NULL,
  duration_seconds integer NOT NULL DEFAULT 0,
  device_info jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.live_face_warnings REPLICA IDENTITY FULL;

CREATE TABLE IF NOT EXISTS public.rekognition_shards (
  shard_id text PRIMARY KEY,
  shard_index integer NOT NULL,
  face_count bigint NOT NULL DEFAULT 0,
  capacity bigint NOT NULL DEFAULT 20000000,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rekognition_shards_shard_index_key UNIQUE (shard_index)
);

ALTER TABLE public.face_verification_submissions
  ADD COLUMN IF NOT EXISTS rekognition_shard_id text,
  ADD COLUMN IF NOT EXISTS rekognition_face_id text,
  ADD COLUMN IF NOT EXISTS rekognition_external_image_id text,
  ADD COLUMN IF NOT EXISTS rekognition_indexed_at timestamptz,
  ADD COLUMN IF NOT EXISTS rekognition_confidence numeric(5,2);

CREATE INDEX IF NOT EXISTS idx_live_face_warnings_host_day ON public.live_face_warnings (host_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_live_face_warnings_stream ON public.live_face_warnings (stream_id);
CREATE INDEX IF NOT EXISTS idx_live_face_warnings_event_time ON public.live_face_warnings (event, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_fvs_rekognition_face_id ON public.face_verification_submissions (rekognition_face_id) WHERE rekognition_face_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_fvs_rekognition_shard ON public.face_verification_submissions (rekognition_shard_id) WHERE rekognition_shard_id IS NOT NULL;

INSERT INTO public.rekognition_shards (shard_id, shard_index, face_count, capacity, is_active)
SELECT 'merilive-verified-faces-' || gs.i, gs.i, 0::bigint, 20000000::bigint, true
FROM generate_series(0, 29) AS gs(i)
ON CONFLICT (shard_id) DO NOTHING;

INSERT INTO public.app_settings (setting_key, setting_value)
VALUES
  ('live_face_warning_seconds', '10'),
  ('live_face_autoend_seconds', '30'),
  ('live_face_strikes_per_day', '3'),
  ('live_face_ban_after_strikes', 'true'),
  ('live_face_detection_enabled', 'true'),
  ('live_face_min_confidence', '0.70'),
  ('rekognition_shard_count', '30'),
  ('rekognition_match_threshold', '92.0'),
  ('rekognition_quality_min', '80.0')
ON CONFLICT (setting_key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.get_next_available_shard()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_shard text;
BEGIN
  SELECT s.shard_id INTO v_shard
  FROM public.rekognition_shards s
  WHERE s.is_active AND s.face_count < s.capacity
  ORDER BY s.face_count ASC, s.shard_index ASC
  LIMIT 1;
  IF v_shard IS NULL THEN
    RAISE EXCEPTION 'no rekognition shard capacity';
  END IF;
  RETURN v_shard;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_live_face_warnings_validate_fn()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.session_type IS NULL OR NEW.session_type NOT IN ('live', 'private_call', 'party') THEN
    RAISE EXCEPTION 'invalid session_type';
  END IF;
  IF NEW.event IS NULL OR NEW.event NOT IN ('face_absent_warning', 'face_absent_autoend', 'face_returned') THEN
    RAISE EXCEPTION 'invalid event';
  END IF;
  IF NEW.duration_seconds IS NULL THEN
    NEW.duration_seconds := 0;
  ELSIF NEW.duration_seconds < 0 THEN
    RAISE EXCEPTION 'invalid duration_seconds';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_live_face_warnings_validate ON public.live_face_warnings;
CREATE TRIGGER trg_live_face_warnings_validate
BEFORE INSERT OR UPDATE ON public.live_face_warnings
FOR EACH ROW
EXECUTE FUNCTION public.trg_live_face_warnings_validate_fn();

CREATE OR REPLACE FUNCTION public.report_live_face_event(
  p_stream_id uuid,
  p_session_type text,
  p_event text,
  p_duration_seconds integer,
  p_device_info jsonb DEFAULT '{}'::jsonb
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;
  IF p_session_type IS NULL OR p_session_type NOT IN ('live', 'private_call', 'party') THEN
    RAISE EXCEPTION 'invalid session_type';
  END IF;
  IF p_event IS NULL OR p_event NOT IN ('face_absent_warning', 'face_absent_autoend', 'face_returned') THEN
    RAISE EXCEPTION 'invalid event';
  END IF;
  INSERT INTO public.live_face_warnings (
    host_id, stream_id, session_type, event, duration_seconds, device_info
  ) VALUES (
    auth.uid(),
    p_stream_id,
    p_session_type,
    p_event,
    COALESCE(p_duration_seconds, 0),
    COALESCE(p_device_info, '{}'::jsonb)
  )
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_live_face_warnings_stats(p_days integer DEFAULT 7)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_days integer := GREATEST(COALESCE(p_days, 7), 1);
  v_from timestamptz := now() - (v_days::text || ' days')::interval;
BEGIN
  IF NOT public.is_active_admin_session() THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;
  RETURN jsonb_build_object(
    'total_warnings',
    (SELECT COUNT(*)::int FROM public.live_face_warnings w WHERE w.occurred_at >= v_from AND w.event = 'face_absent_warning'),
    'total_autoends',
    (SELECT COUNT(*)::int FROM public.live_face_warnings w WHERE w.occurred_at >= v_from AND w.event = 'face_absent_autoend'),
    'unique_hosts_warned',
    (
      SELECT COUNT(DISTINCT w.host_id)::int
      FROM public.live_face_warnings w
      WHERE w.occurred_at >= v_from
        AND w.event IN ('face_absent_warning', 'face_absent_autoend')
    ),
    'top_offenders',
    COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'host_id', t.host_id,
            'username', t.username,
            'warnings', t.warnings,
            'autoends', t.autoends
          )
          ORDER BY t.warnings + t.autoends DESC
        )
        FROM (
          SELECT
            w.host_id,
            COALESCE(MAX(pp.display_name), MAX(pp.username), '')::text AS username,
            SUM(CASE WHEN w.event = 'face_absent_warning' THEN 1 ELSE 0 END)::int AS warnings,
            SUM(CASE WHEN w.event = 'face_absent_autoend' THEN 1 ELSE 0 END)::int AS autoends
          FROM public.live_face_warnings w
          LEFT JOIN public.profiles_public pp ON pp.id = w.host_id
          WHERE w.occurred_at >= v_from
          GROUP BY w.host_id
          ORDER BY SUM(CASE WHEN w.event = 'face_absent_warning' THEN 1 ELSE 0 END)
            + SUM(CASE WHEN w.event = 'face_absent_autoend' THEN 1 ELSE 0 END) DESC
          LIMIT 20
        ) t
      ),
      '[]'::jsonb
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_live_face_warnings_paginated(
  p_page integer DEFAULT 1,
  p_page_size integer DEFAULT 50,
  p_event text DEFAULT NULL,
  p_host_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_page integer := GREATEST(COALESCE(p_page, 1), 1);
  v_ps integer := LEAST(GREATEST(COALESCE(p_page_size, 50), 1), 200);
  v_off integer;
  v_total bigint;
  v_rows jsonb;
BEGIN
  IF NOT public.is_active_admin_session() THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;
  v_off := (v_page - 1) * v_ps;
  SELECT COUNT(*) INTO v_total
  FROM public.live_face_warnings w
  WHERE (p_event IS NULL OR w.event = p_event)
    AND (p_host_id IS NULL OR w.host_id = p_host_id);
  SELECT COALESCE(jsonb_agg(to_jsonb(r)), '[]'::jsonb) INTO v_rows
  FROM (
    SELECT
      w.id,
      w.host_id,
      w.stream_id,
      w.session_type,
      w.event,
      w.duration_seconds,
      w.device_info,
      w.occurred_at,
      COALESCE(pp.display_name, pp.username, '') AS username,
      pp.avatar_url
    FROM public.live_face_warnings w
    LEFT JOIN public.profiles_public pp ON pp.id = w.host_id
    WHERE (p_event IS NULL OR w.event = p_event)
      AND (p_host_id IS NULL OR w.host_id = p_host_id)
    ORDER BY w.occurred_at DESC
    LIMIT v_ps OFFSET v_off
  ) r;
  RETURN jsonb_build_object(
    'rows', COALESCE(v_rows, '[]'::jsonb),
    'total', v_total,
    'page', v_page,
    'page_size', v_ps
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_rekognition_shard_stats()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_active_admin_session() THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;
  RETURN COALESCE(
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'shard_id', s.shard_id,
          'shard_index', s.shard_index,
          'face_count', s.face_count,
          'capacity', s.capacity,
          'utilization_pct',
          CASE
            WHEN s.capacity > 0 THEN round((s.face_count::numeric / s.capacity::numeric) * 100.0, 2)
            ELSE 0::numeric
          END,
          'is_active', s.is_active
        )
        ORDER BY s.shard_index
      )
      FROM public.rekognition_shards s
    ),
    '[]'::jsonb
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_live_face_autoend_strike_fn()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_strikes_cfg text;
  v_ban_cfg text;
  v_strikes int;
  v_cnt int;
  v_ban_after boolean;
  v_has_active boolean;
  v_lb_ok boolean;
BEGIN
  IF NEW.event IS DISTINCT FROM 'face_absent_autoend' THEN
    RETURN NEW;
  END IF;
  IF to_regclass('public.live_bans') IS NULL THEN
    RAISE NOTICE 'trg_live_face_autoend_strike_fn: live_bans missing';
    RETURN NEW;
  END IF;
  SELECT
    EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'live_bans' AND column_name = 'user_id'
    )
    AND EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'live_bans' AND column_name = 'reason'
    )
    AND EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'live_bans' AND column_name = 'banned_by'
    )
    AND EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'live_bans' AND column_name = 'is_active'
    )
    AND EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'live_bans' AND column_name = 'severity'
    )
  INTO v_lb_ok;
  IF NOT COALESCE(v_lb_ok, false) THEN
    RAISE NOTICE 'trg_live_face_autoend_strike_fn: live_bans expected columns missing';
    RETURN NEW;
  END IF;
  SELECT setting_value INTO v_strikes_cfg FROM public.app_settings WHERE setting_key = 'live_face_strikes_per_day' LIMIT 1;
  IF v_strikes_cfg IS NULL OR btrim(v_strikes_cfg) = '' THEN
    RAISE EXCEPTION 'app_settings.live_face_strikes_per_day missing';
  END IF;
  SELECT setting_value INTO v_ban_cfg FROM public.app_settings WHERE setting_key = 'live_face_ban_after_strikes' LIMIT 1;
  IF v_ban_cfg IS NULL OR btrim(v_ban_cfg) = '' THEN
    RAISE EXCEPTION 'app_settings.live_face_ban_after_strikes missing';
  END IF;
  BEGIN
    v_strikes := v_strikes_cfg::integer;
  EXCEPTION WHEN others THEN
    RAISE EXCEPTION 'app_settings.live_face_strikes_per_day invalid';
  END;
  v_ban_after := lower(btrim(v_ban_cfg)) IN ('true', 't', '1', 'yes');
  SELECT COUNT(*)::int INTO v_cnt
  FROM public.live_face_warnings w
  WHERE w.host_id = NEW.host_id
    AND w.event = 'face_absent_autoend'
    AND (w.occurred_at AT TIME ZONE 'UTC')::date = (NEW.occurred_at AT TIME ZONE 'UTC')::date;
  IF v_cnt >= v_strikes AND v_ban_after THEN
    SELECT EXISTS (
      SELECT 1 FROM public.live_bans lb
      WHERE lb.user_id = NEW.host_id
        AND lb.is_active = true
        AND (
          (lb.ban_end IS NULL AND lb.expires_at IS NULL)
          OR COALESCE(lb.ban_end, lb.expires_at, 'infinity'::timestamptz) > now()
        )
    ) INTO v_has_active;
    IF NOT COALESCE(v_has_active, false) THEN
      INSERT INTO public.live_bans (
        user_id,
        banned_by,
        reason,
        ban_type,
        ban_duration_hours,
        expires_at,
        is_active,
        ban_reason,
        violation_type,
        warning_count,
        ban_start,
        ban_end,
        auto_banned,
        severity,
        device_banned,
        ip_banned,
        face_hash_banned
      ) VALUES (
        NEW.host_id,
        '00000000-0000-0000-0000-000000000000'::uuid,
        'auto: face absence repeated strikes',
        'temporary',
        24,
        now() + interval '24 hours',
        true,
        'auto: face absence repeated strikes',
        'face_absence',
        0,
        now(),
        now() + interval '24 hours',
        true,
        'medium',
        false,
        false,
        false
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_live_face_autoend_strike ON public.live_face_warnings;
CREATE TRIGGER trg_live_face_autoend_strike
AFTER INSERT ON public.live_face_warnings
FOR EACH ROW
EXECUTE FUNCTION public.trg_live_face_autoend_strike_fn();

ALTER TABLE public.live_face_warnings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rekognition_shards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS live_face_warnings_insert_host ON public.live_face_warnings;
CREATE POLICY live_face_warnings_insert_host
ON public.live_face_warnings
FOR INSERT
TO authenticated
WITH CHECK (host_id = auth.uid());

DROP POLICY IF EXISTS live_face_warnings_select_host_or_admin ON public.live_face_warnings;
CREATE POLICY live_face_warnings_select_host_or_admin
ON public.live_face_warnings
FOR SELECT
TO authenticated
USING (host_id = auth.uid() OR public.is_active_admin_session());

DROP POLICY IF EXISTS live_face_warnings_admin_all ON public.live_face_warnings;
CREATE POLICY live_face_warnings_admin_all
ON public.live_face_warnings
FOR ALL
TO authenticated
USING (public.is_active_admin_session())
WITH CHECK (public.is_active_admin_session());

DROP POLICY IF EXISTS rekognition_shards_select_auth ON public.rekognition_shards;
CREATE POLICY rekognition_shards_select_auth
ON public.rekognition_shards
FOR SELECT
TO authenticated
USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS rekognition_shards_admin_all ON public.rekognition_shards;
CREATE POLICY rekognition_shards_admin_all
ON public.rekognition_shards
FOR ALL
TO authenticated
USING (public.is_active_admin_session())
WITH CHECK (public.is_active_admin_session());

REVOKE ALL ON TABLE public.live_face_warnings FROM PUBLIC;
REVOKE ALL ON TABLE public.rekognition_shards FROM PUBLIC;
GRANT SELECT, INSERT ON TABLE public.live_face_warnings TO authenticated;
GRANT SELECT ON TABLE public.rekognition_shards TO authenticated;

REVOKE ALL ON FUNCTION public.get_next_available_shard() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.report_live_face_event(uuid, text, text, integer, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_live_face_warnings_stats(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_list_live_face_warnings_paginated(integer, integer, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_rekognition_shard_stats() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.trg_live_face_autoend_strike_fn() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.trg_live_face_warnings_validate_fn() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_next_available_shard() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.report_live_face_event(uuid, text, text, integer, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_live_face_warnings_stats(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_live_face_warnings_paginated(integer, integer, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_rekognition_shard_stats() TO authenticated;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.live_face_warnings;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END;
$$;