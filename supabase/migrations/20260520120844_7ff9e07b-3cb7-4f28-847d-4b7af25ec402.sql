-- ============================================================================
-- Pkg64: Moderation Audit Log
-- Captures every INSERT/UPDATE/DELETE on moderation & report tables with
-- actor (admin or system), action, target, before/after diff, IP, timestamp.
-- Exposed via admin_list_moderation_audit RPC + admin_broadcast.
-- ============================================================================

-- 1. Table ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.moderation_audit_log (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  occurred_at     timestamptz NOT NULL DEFAULT now(),
  table_name      text NOT NULL,
  action          text NOT NULL CHECK (action IN ('INSERT','UPDATE','DELETE')),
  row_id          text,
  target_user_id  uuid,
  admin_id        uuid,
  admin_display   text,
  ip_address      text,
  summary         text,
  before_data     jsonb,
  after_data      jsonb,
  changed_keys    text[]
);

CREATE INDEX IF NOT EXISTS idx_mod_audit_occurred ON public.moderation_audit_log (occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_mod_audit_table    ON public.moderation_audit_log (table_name, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_mod_audit_admin    ON public.moderation_audit_log (admin_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_mod_audit_target   ON public.moderation_audit_log (target_user_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_mod_audit_action   ON public.moderation_audit_log (action, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_mod_audit_summary  ON public.moderation_audit_log USING gin (to_tsvector('simple', coalesce(summary,'')));

ALTER TABLE public.moderation_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin session full access" ON public.moderation_audit_log;
CREATE POLICY "Admin session full access" ON public.moderation_audit_log
  FOR ALL USING (public.is_active_admin_session()) WITH CHECK (public.is_active_admin_session());

-- 2. Audit trigger -------------------------------------------------------
CREATE OR REPLACE FUNCTION public._mod_audit_extract_target(_row jsonb)
RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT COALESCE(
    NULLIF(_row->>'user_id','')::uuid,
    NULLIF(_row->>'target_user_id','')::uuid,
    NULLIF(_row->>'reported_user_id','')::uuid,
    NULLIF(_row->>'host_user_id','')::uuid,
    NULLIF(_row->>'blocked_user_id','')::uuid,
    NULLIF(_row->>'banned_user_id','')::uuid,
    NULLIF(_row->>'reporter_id','')::uuid
  );
$$;

CREATE OR REPLACE FUNCTION public._mod_audit_summary(_table text, _action text, _new jsonb, _old jsonb)
RETURNS text LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  v_status text;
  v_reason text;
BEGIN
  v_status := COALESCE(_new->>'status', _old->>'status');
  v_reason := COALESCE(_new->>'reason', _new->>'ban_reason', _new->>'description',
                       _old->>'reason', _old->>'ban_reason', _old->>'description');
  RETURN trim(both ' ' from
    _action || ' on ' || _table
    || COALESCE(' [status=' || v_status || ']', '')
    || COALESCE(' — ' || left(v_reason, 200), '')
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.tg_moderation_audit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_admin uuid;
  v_display text;
  v_new jsonb;
  v_old jsonb;
  v_changed text[];
  v_target uuid;
  v_row_id text;
  v_ip text;
BEGIN
  v_new := CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE to_jsonb(NEW) END;
  v_old := CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE to_jsonb(OLD) END;

  IF TG_OP = 'UPDATE' THEN
    SELECT array_agg(k) INTO v_changed
    FROM (
      SELECT key AS k FROM jsonb_each(v_new)
      WHERE v_new->key IS DISTINCT FROM v_old->key
        AND key NOT IN ('updated_at','last_seen_at')
    ) s;
    IF v_changed IS NULL OR array_length(v_changed,1) = 0 THEN
      RETURN COALESCE(NEW, OLD);
    END IF;
  END IF;

  v_admin := public.current_admin_id();
  IF v_admin IS NOT NULL THEN
    SELECT COALESCE(display_name, username, email)
      INTO v_display FROM public.admin_users WHERE id = v_admin LIMIT 1;
  END IF;

  v_target := public._mod_audit_extract_target(COALESCE(v_new, v_old));
  v_row_id := COALESCE(v_new->>'id', v_old->>'id');

  BEGIN
    v_ip := current_setting('request.headers', true)::json->>'x-forwarded-for';
  EXCEPTION WHEN OTHERS THEN v_ip := NULL; END;

  INSERT INTO public.moderation_audit_log (
    table_name, action, row_id, target_user_id,
    admin_id, admin_display, ip_address,
    summary, before_data, after_data, changed_keys
  ) VALUES (
    TG_TABLE_NAME, TG_OP, v_row_id, v_target,
    v_admin, v_display, v_ip,
    public._mod_audit_summary(TG_TABLE_NAME, TG_OP, v_new, v_old),
    v_old, v_new, v_changed
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- 3. Attach to every moderation table -----------------------------------
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'live_bans', 'blocked_users', 'blocked_ips', 'banned_devices',
    'host_contact_violations', 'live_face_violations',
    'user_reports', 'support_reports', 'chat_moderation_logs',
    'admin_permanent_ban_cases', 'admin_permanent_ban_case_targets'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=t) THEN
      EXECUTE format('DROP TRIGGER IF EXISTS tg_moderation_audit_%I ON public.%I', t, t);
      EXECUTE format(
        'CREATE TRIGGER tg_moderation_audit_%I AFTER INSERT OR UPDATE OR DELETE ON public.%I
         FOR EACH ROW EXECUTE FUNCTION public.tg_moderation_audit()', t, t
      );
    END IF;
  END LOOP;
END $$;

-- 4. Broadcast trigger so admins see new rows instantly ------------------
DROP TRIGGER IF EXISTS tg_admin_broadcast_moderation_audit ON public.moderation_audit_log;
CREATE TRIGGER tg_admin_broadcast_moderation_audit
  AFTER INSERT ON public.moderation_audit_log
  FOR EACH ROW EXECUTE FUNCTION public.tg_admin_broadcast_bump('moderation_audit_log');

-- 5. Paginated, searchable read RPC --------------------------------------
CREATE OR REPLACE FUNCTION public.admin_list_moderation_audit(
  _search text DEFAULT NULL,
  _table  text DEFAULT NULL,
  _action text DEFAULT NULL,
  _admin_id uuid DEFAULT NULL,
  _target_user_id uuid DEFAULT NULL,
  _from timestamptz DEFAULT NULL,
  _to   timestamptz DEFAULT NULL,
  _limit int DEFAULT 50,
  _offset int DEFAULT 0
)
RETURNS TABLE (
  id uuid, occurred_at timestamptz, table_name text, action text,
  row_id text, target_user_id uuid, admin_id uuid, admin_display text,
  ip_address text, summary text, changed_keys text[],
  before_data jsonb, after_data jsonb, total_count bigint
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_total bigint;
BEGIN
  IF NOT public.is_active_admin_session() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT count(*) INTO v_total FROM public.moderation_audit_log m
  WHERE (_table IS NULL OR m.table_name = _table)
    AND (_action IS NULL OR m.action = _action)
    AND (_admin_id IS NULL OR m.admin_id = _admin_id)
    AND (_target_user_id IS NULL OR m.target_user_id = _target_user_id)
    AND (_from IS NULL OR m.occurred_at >= _from)
    AND (_to   IS NULL OR m.occurred_at <  _to)
    AND (_search IS NULL OR _search = '' OR
         m.summary ILIKE '%'||_search||'%' OR
         m.row_id  ILIKE '%'||_search||'%' OR
         m.admin_display ILIKE '%'||_search||'%' OR
         m.target_user_id::text = _search);

  RETURN QUERY
  SELECT m.id, m.occurred_at, m.table_name, m.action,
         m.row_id, m.target_user_id, m.admin_id, m.admin_display,
         m.ip_address, m.summary, m.changed_keys,
         m.before_data, m.after_data, v_total
  FROM public.moderation_audit_log m
  WHERE (_table IS NULL OR m.table_name = _table)
    AND (_action IS NULL OR m.action = _action)
    AND (_admin_id IS NULL OR m.admin_id = _admin_id)
    AND (_target_user_id IS NULL OR m.target_user_id = _target_user_id)
    AND (_from IS NULL OR m.occurred_at >= _from)
    AND (_to   IS NULL OR m.occurred_at <  _to)
    AND (_search IS NULL OR _search = '' OR
         m.summary ILIKE '%'||_search||'%' OR
         m.row_id  ILIKE '%'||_search||'%' OR
         m.admin_display ILIKE '%'||_search||'%' OR
         m.target_user_id::text = _search)
  ORDER BY m.occurred_at DESC
  LIMIT GREATEST(1, LEAST(_limit, 200))
  OFFSET GREATEST(0, _offset);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_moderation_audit(text,text,text,uuid,uuid,timestamptz,timestamptz,int,int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_list_moderation_audit(text,text,text,uuid,uuid,timestamptz,timestamptz,int,int) TO anon, authenticated;

-- 6. Stats RPC for the page header --------------------------------------
CREATE OR REPLACE FUNCTION public.admin_moderation_audit_stats()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r jsonb;
BEGIN
  IF NOT public.is_active_admin_session() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  SELECT jsonb_build_object(
    'total',     (SELECT count(*) FROM public.moderation_audit_log),
    'today',     (SELECT count(*) FROM public.moderation_audit_log WHERE occurred_at >= date_trunc('day', now())),
    'last_7d',   (SELECT count(*) FROM public.moderation_audit_log WHERE occurred_at >= now() - interval '7 days'),
    'by_action', (SELECT jsonb_object_agg(action, c) FROM (
                    SELECT action, count(*) c FROM public.moderation_audit_log
                    WHERE occurred_at >= now() - interval '7 days' GROUP BY action) s),
    'by_table',  (SELECT jsonb_object_agg(table_name, c) FROM (
                    SELECT table_name, count(*) c FROM public.moderation_audit_log
                    WHERE occurred_at >= now() - interval '7 days' GROUP BY table_name) s)
  ) INTO r;
  RETURN r;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_moderation_audit_stats() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_moderation_audit_stats() TO anon, authenticated;