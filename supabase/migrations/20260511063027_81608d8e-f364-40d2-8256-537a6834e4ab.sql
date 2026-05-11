
ALTER TABLE public.admin_users ADD COLUMN IF NOT EXISTS support_display_name text;
ALTER TABLE public.support_messages ADD COLUMN IF NOT EXISTS support_admin_name text;

CREATE OR REPLACE FUNCTION public.is_active_admin_owner_session()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admin_users
    WHERE id = public.current_admin_id_from_header()
      AND is_active = true AND role = 'owner'
  );
$$;

CREATE TABLE IF NOT EXISTS public.support_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid,
  message_id uuid,
  user_id uuid,
  user_app_uid text,
  ticket_subject text,
  message_content text NOT NULL DEFAULT '',
  reason text NOT NULL,
  reported_by_admin_id uuid REFERENCES public.admin_users(id) ON DELETE SET NULL,
  reported_by_admin_name text,
  status text NOT NULL DEFAULT 'open',
  reviewed_by_owner_id uuid REFERENCES public.admin_users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  owner_notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_support_reports_status_created ON public.support_reports(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_reports_admin ON public.support_reports(reported_by_admin_id);

ALTER TABLE public.support_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owner full access support_reports" ON public.support_reports;
CREATE POLICY "Owner full access support_reports" ON public.support_reports
  FOR ALL USING (public.is_active_admin_owner_session())
  WITH CHECK (public.is_active_admin_owner_session());

DROP POLICY IF EXISTS "Admin reads own support reports" ON public.support_reports;
CREATE POLICY "Admin reads own support reports" ON public.support_reports
  FOR SELECT USING (
    public.is_active_admin_session()
    AND reported_by_admin_id = public.current_admin_id_from_header()
  );

DROP POLICY IF EXISTS "Admin can insert own support report" ON public.support_reports;
CREATE POLICY "Admin can insert own support report" ON public.support_reports
  FOR INSERT WITH CHECK (
    public.is_active_admin_session()
    AND reported_by_admin_id = public.current_admin_id_from_header()
  );

CREATE OR REPLACE FUNCTION public.support_admin_file_report(
  _ticket_id uuid, _message_id uuid, _reason text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_admin_id uuid := public.current_admin_id_from_header();
  v_admin_name text;
  v_user_id uuid;
  v_user_uid text;
  v_subject text;
  v_msg text := '';
  v_report_id uuid;
BEGIN
  IF v_admin_id IS NULL THEN RAISE EXCEPTION 'not_admin'; END IF;
  IF _reason IS NULL OR length(trim(_reason)) = 0 THEN RAISE EXCEPTION 'reason_required'; END IF;

  SELECT COALESCE(NULLIF(trim(support_display_name), ''), display_name, email)
    INTO v_admin_name
  FROM public.admin_users WHERE id = v_admin_id;

  SELECT user_id, subject INTO v_user_id, v_subject
  FROM public.support_tickets WHERE id = _ticket_id;
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'ticket_not_found'; END IF;

  SELECT app_uid INTO v_user_uid FROM public.profiles WHERE id = v_user_id;

  IF _message_id IS NOT NULL THEN
    SELECT content INTO v_msg FROM public.support_messages
    WHERE id = _message_id AND ticket_id = _ticket_id;
  END IF;

  INSERT INTO public.support_reports(
    ticket_id, message_id, user_id, user_app_uid,
    ticket_subject, message_content, reason,
    reported_by_admin_id, reported_by_admin_name
  ) VALUES (
    _ticket_id, _message_id, v_user_id, v_user_uid,
    v_subject, COALESCE(v_msg, ''), _reason,
    v_admin_id, v_admin_name
  ) RETURNING id INTO v_report_id;

  INSERT INTO public.notifications(user_id, title, message, type, data)
  SELECT au.user_id,
         '🚨 Support Report',
         v_admin_name || ' reported a support issue',
         'admin_support_report',
         jsonb_build_object(
           'report_id', v_report_id,
           'ticket_id', _ticket_id,
           'user_id', v_user_id,
           'user_app_uid', v_user_uid
         )
  FROM public.admin_users au
  WHERE au.role = 'owner' AND au.is_active = true AND au.user_id IS NOT NULL;

  RETURN v_report_id;
END; $$;
GRANT EXECUTE ON FUNCTION public.support_admin_file_report(uuid, uuid, text) TO authenticated, anon;

CREATE OR REPLACE FUNCTION public.admin_list_support_reports(
  _status text DEFAULT NULL, _limit int DEFAULT 100, _offset int DEFAULT 0
) RETURNS TABLE (
  id uuid, ticket_id uuid, message_id uuid, user_id uuid, user_app_uid text,
  user_display_name text, ticket_subject text, message_content text, reason text,
  reported_by_admin_id uuid, reported_by_admin_name text, status text,
  owner_notes text, reviewed_at timestamptz, created_at timestamptz
) LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT public.is_active_admin_owner_session() THEN RAISE EXCEPTION 'owner_only'; END IF;
  RETURN QUERY
  SELECT r.id, r.ticket_id, r.message_id, r.user_id, r.user_app_uid,
         p.display_name, r.ticket_subject, r.message_content, r.reason,
         r.reported_by_admin_id, r.reported_by_admin_name, r.status,
         r.owner_notes, r.reviewed_at, r.created_at
  FROM public.support_reports r
  LEFT JOIN public.profiles p ON p.id = r.user_id
  WHERE (_status IS NULL OR r.status = _status)
  ORDER BY r.created_at DESC
  LIMIT _limit OFFSET _offset;
END; $$;
GRANT EXECUTE ON FUNCTION public.admin_list_support_reports(text, int, int) TO authenticated, anon;

CREATE OR REPLACE FUNCTION public.admin_update_support_report(
  _report_id uuid, _status text, _notes text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_owner_id uuid := public.current_admin_id_from_header();
BEGIN
  IF NOT public.is_active_admin_owner_session() THEN RAISE EXCEPTION 'owner_only'; END IF;
  IF _status NOT IN ('open','reviewed','dismissed') THEN RAISE EXCEPTION 'invalid_status'; END IF;
  UPDATE public.support_reports
  SET status = _status,
      owner_notes = COALESCE(_notes, owner_notes),
      reviewed_by_owner_id = v_owner_id,
      reviewed_at = CASE WHEN _status = 'open' THEN NULL ELSE now() END
  WHERE id = _report_id;
END; $$;
GRANT EXECUTE ON FUNCTION public.admin_update_support_report(uuid, text, text) TO authenticated, anon;

CREATE OR REPLACE FUNCTION public.admin_update_my_support_display_name(_name text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_admin_id uuid := public.current_admin_id_from_header();
  v_clean text := NULLIF(trim(COALESCE(_name, '')), '');
BEGIN
  IF v_admin_id IS NULL THEN RAISE EXCEPTION 'not_admin'; END IF;
  IF v_clean IS NOT NULL AND length(v_clean) > 60 THEN RAISE EXCEPTION 'name_too_long'; END IF;
  UPDATE public.admin_users SET support_display_name = v_clean WHERE id = v_admin_id;
  RETURN v_clean;
END; $$;
GRANT EXECUTE ON FUNCTION public.admin_update_my_support_display_name(text) TO authenticated, anon;

INSERT INTO public.admin_sections(section_key, section_name, hub_key, display_order, is_active)
SELECT 'support-reports', 'Support Reports', 'moderation-hub', 5, true
WHERE NOT EXISTS (SELECT 1 FROM public.admin_sections WHERE section_key = 'support-reports');
