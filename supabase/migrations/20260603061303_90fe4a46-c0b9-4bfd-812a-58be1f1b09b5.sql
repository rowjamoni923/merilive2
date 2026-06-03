-- ════════════════════════════════════════════════════════════════════
-- Pkg347 Reels & Moderation deep-audit lockdown
-- ════════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────────
-- PART A: RPC privilege-escalation fixes (8 RPCs)
-- ────────────────────────────────────────────────────────────────────

-- A1. admin_delete_reel — was: any sub-admin
CREATE OR REPLACE FUNCTION public.admin_delete_reel(_admin_id uuid, _reel_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF public.current_admin_id_from_header() IS NULL THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;
  IF NOT public.admin_has_any_section_permission(
       ARRAY['reels','moderation','moderation-hub','content-hub'], true) THEN
    RAISE EXCEPTION 'Insufficient section permission (reels/moderation required)';
  END IF;
  DELETE FROM public.reels WHERE id = _reel_id;
END;
$function$;

-- A2. admin_update_reel_status (3-arg overload)
CREATE OR REPLACE FUNCTION public.admin_update_reel_status(
  _reel_id uuid,
  _is_approved boolean DEFAULT NULL,
  _is_active boolean DEFAULT NULL)
RETURNS reels
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_row public.reels;
BEGIN
  IF public.current_admin_id_from_header() IS NULL THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;
  IF NOT public.admin_has_any_section_permission(
       ARRAY['reels','moderation','moderation-hub','content-hub'], true) THEN
    RAISE EXCEPTION 'Insufficient section permission (reels/moderation required)';
  END IF;
  UPDATE public.reels
  SET is_approved = COALESCE(_is_approved, is_approved),
      is_active = COALESCE(_is_active, is_active),
      updated_at = now()
  WHERE id = _reel_id
  RETURNING * INTO v_row;
  IF v_row.id IS NULL THEN RAISE EXCEPTION 'reel not found'; END IF;
  RETURN v_row;
END;
$function$;

-- A3. admin_update_reel_status (4-arg overload, with is_featured)
CREATE OR REPLACE FUNCTION public.admin_update_reel_status(
  _reel_id uuid,
  _is_approved boolean DEFAULT NULL,
  _is_active boolean DEFAULT NULL,
  _is_featured boolean DEFAULT NULL)
RETURNS reels
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_row public.reels;
BEGIN
  IF public.current_admin_id_from_header() IS NULL THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;
  IF NOT public.admin_has_any_section_permission(
       ARRAY['reels','moderation','moderation-hub','content-hub'], true) THEN
    RAISE EXCEPTION 'Insufficient section permission (reels/moderation required)';
  END IF;
  UPDATE public.reels
  SET is_approved = COALESCE(_is_approved, is_approved),
      is_active = COALESCE(_is_active, is_active),
      is_featured = COALESCE(_is_featured, is_featured),
      updated_at = now()
  WHERE id = _reel_id
  RETURNING * INTO v_row;
  IF v_row.id IS NULL THEN RAISE EXCEPTION 'reel not found'; END IF;
  RETURN v_row;
END;
$function$;

-- A4. admin_resolve_reel_report
CREATE OR REPLACE FUNCTION public.admin_resolve_reel_report(_report_id uuid, _status text)
RETURNS reel_reports
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_admin_id uuid;
  v_report public.reel_reports;
BEGIN
  v_admin_id := public.current_admin_id_from_header();
  IF v_admin_id IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  IF NOT public.admin_has_any_section_permission(
       ARRAY['reels','user-reports','moderation','moderation-hub','reports'], true) THEN
    RAISE EXCEPTION 'Insufficient section permission (reels/user-reports/moderation required)';
  END IF;
  IF _status NOT IN ('reviewed','dismissed','action_taken') THEN
    RAISE EXCEPTION 'invalid status';
  END IF;
  UPDATE public.reel_reports
  SET status = _status, reviewed_by = v_admin_id, reviewed_at = now()
  WHERE id = _report_id
  RETURNING * INTO v_report;
  IF v_report.id IS NULL THEN RAISE EXCEPTION 'report not found'; END IF;
  RETURN v_report;
END;
$function$;

-- A5. admin_apply_severity_ban — was: any sub-admin permanently bans anyone
CREATE OR REPLACE FUNCTION public.admin_apply_severity_ban(
  _target_user_id uuid,
  _severity text,
  _duration_value integer DEFAULT 0,
  _reason text DEFAULT NULL,
  _evidence jsonb DEFAULT '[]'::jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_admin_id uuid := public.current_admin_id_from_header();
BEGIN
  IF v_admin_id IS NULL THEN
    RETURN jsonb_build_object('success',false,'error','Not authenticated as admin');
  END IF;
  IF NOT public.admin_has_any_section_permission(
       ARRAY['moderation','moderation-hub','user-management','live-bans','permanent-ban','all-hosts'], true) THEN
    RETURN jsonb_build_object('success',false,'error','Insufficient section permission');
  END IF;
  IF _target_user_id IS NULL THEN
    RETURN jsonb_build_object('success',false,'error','Missing target user');
  END IF;
  IF public._is_target_user_owner(_target_user_id) THEN
    RETURN jsonb_build_object('success',false,'error','Cannot ban owner account');
  END IF;
  PERFORM set_config('app.bypass_profile_protection','true',true);
  UPDATE profiles
     SET is_blocked = true, blocked_at = now(),
         blocked_reason = COALESCE(_reason, _severity || ' severity ban'),
         updated_at = now()
   WHERE id = _target_user_id;
  INSERT INTO live_bans (user_id, banned_by, reason, ban_reason, severity, is_active,
                         ban_duration_hours, expires_at, ban_type, auto_banned)
  VALUES (_target_user_id, v_admin_id,
          COALESCE(_reason,_severity||' ban'), COALESCE(_reason,_severity||' ban'),
          _severity, true,
          CASE WHEN _duration_value > 0 THEN _duration_value ELSE NULL END,
          CASE WHEN _duration_value > 0 THEN now()+make_interval(hours => _duration_value) ELSE NULL END,
          'permanent', false);
  BEGIN
    INSERT INTO admin_logs (admin_id, action_type, target_type, target_id, details)
    VALUES (v_admin_id, 'severity_ban_'||_severity, 'user', _target_user_id,
            jsonb_build_object('severity',_severity,'duration_hours',_duration_value,'reason',_reason));
  EXCEPTION WHEN OTHERS THEN NULL; END;
  RETURN jsonb_build_object('success',true);
END $function$;

-- A6. admin_session_unban_live
CREATE OR REPLACE FUNCTION public.admin_session_unban_live(_admin_id uuid, _ban_id uuid, _reason text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT is_active_admin_session() THEN
    RETURN jsonb_build_object('success',false,'error','Not authorized');
  END IF;
  IF NOT public.admin_has_any_section_permission(
       ARRAY['live-bans','moderation','moderation-hub','user-management'], true) THEN
    RETURN jsonb_build_object('success',false,'error','Insufficient section permission');
  END IF;
  UPDATE live_bans
     SET is_active = false, unbanned_by = current_admin_id_from_header(),
         unbanned_at = now(), unban_reason = _reason
   WHERE id = _ban_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('success',false,'error','Ban not found'); END IF;
  RETURN jsonb_build_object('success',true);
END $function$;

-- A7. admin_update_face_violation
CREATE OR REPLACE FUNCTION public.admin_update_face_violation(_admin_id uuid, _violation_id uuid, _status text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT is_active_admin_session() THEN
    RETURN jsonb_build_object('success',false,'error','Not authorized');
  END IF;
  IF NOT public.admin_has_any_section_permission(
       ARRAY['face-violations','face-verification','moderation','moderation-hub','live-bans'], true) THEN
    RETURN jsonb_build_object('success',false,'error','Insufficient section permission');
  END IF;
  UPDATE live_face_violations
     SET status = _status, reviewed_by = current_admin_id_from_header(), reviewed_at = now()
   WHERE id = _violation_id;
  RETURN jsonb_build_object('success',FOUND);
END $function$;

-- A8. admin_add_violation
CREATE OR REPLACE FUNCTION public.admin_add_violation(
  p_admin_id uuid, p_host_id uuid, p_detected_content text,
  p_detected_pattern text, p_source_type text, p_notes text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_result JSONB;
  v_violation_id UUID;
  v_admin_id UUID;
BEGIN
  IF NOT public.is_caller_admin() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;
  IF NOT public.admin_has_any_section_permission(
       ARRAY['moderation','moderation-hub','host-management','all-hosts'], true) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient section permission');
  END IF;
  v_admin_id := COALESCE(p_admin_id, auth.uid(), public.current_admin_id_from_header());
  v_result := public.process_contact_violation(p_host_id, p_detected_content, p_detected_pattern, p_source_type, NULL);
  v_violation_id := (v_result->>'violation_id')::UUID;
  UPDATE public.host_contact_violations
  SET is_auto_detected = false, is_reviewed = true,
      reviewed_by = v_admin_id, reviewed_at = now(), review_notes = p_notes
  WHERE id = v_violation_id;
  RETURN v_result;
END;
$function$;

-- Preserve anon/authenticated EXECUTE (Pkg365 pattern — RPCs are internally admin-gated)
DO $$
DECLARE
  fn record;
  arglist text;
BEGIN
  FOR fn IN
    SELECT p.oid, p.proname
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname IN (
      'admin_delete_reel','admin_update_reel_status','admin_resolve_reel_report',
      'admin_apply_severity_ban','admin_session_unban_live','admin_update_face_violation',
      'admin_add_violation')
  LOOP
    arglist := pg_get_function_identity_arguments(fn.oid);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO anon, authenticated', fn.proname, arglist);
  END LOOP;
END $$;

-- ────────────────────────────────────────────────────────────────────
-- PART B: RLS catch-all replacement (12 tables)
-- ────────────────────────────────────────────────────────────────────

-- Drop legacy duplicates that OR-bypass section perms
DROP POLICY IF EXISTS "Only admins can manage banned face hashes" ON public.banned_face_hashes;
DROP POLICY IF EXISTS "Admins can manage audio tracks" ON public.content_audio_tracks;
DROP POLICY IF EXISTS "Admins full access audio tracks" ON public.content_audio_tracks;
DROP POLICY IF EXISTS "Admins full access subtitles" ON public.content_subtitles;
DROP POLICY IF EXISTS "Admins can read all moderation logs" ON public.chat_moderation_logs;
DROP POLICY IF EXISTS "Admins can view all moderation logs" ON public.chat_moderation_logs;
DROP POLICY IF EXISTS "Users can view own moderation logs" ON public.chat_moderation_logs;
DROP POLICY IF EXISTS "Admins can manage all violations" ON public.live_violations;
DROP POLICY IF EXISTS "Admins view all moderation log" ON public.reel_moderation_log;
DROP POLICY IF EXISTS "Users view own moderation log" ON public.reel_moderation_log;

-- Drop catch-all "Admin session full access" on every Pkg347 table
DROP POLICY IF EXISTS "Admin session full access" ON public.banned_face_hashes;
DROP POLICY IF EXISTS "Admin session full access" ON public.chat_moderation_logs;
DROP POLICY IF EXISTS "Admin session full access" ON public.content_audio_tracks;
DROP POLICY IF EXISTS "Admin session full access" ON public.content_subtitles;
DROP POLICY IF EXISTS "Admin session full access" ON public.moderation_audit_log;
DROP POLICY IF EXISTS "Admin session full access" ON public.reel_categories;
DROP POLICY IF EXISTS "Admin session full access" ON public.reel_comments;
DROP POLICY IF EXISTS "Admin session full access" ON public.reel_likes;
DROP POLICY IF EXISTS "Admin session full access" ON public.reel_moderation_log;
DROP POLICY IF EXISTS "Admin session full access" ON public.reel_reports;
DROP POLICY IF EXISTS "Admin session full access" ON public.reel_shares;
DROP POLICY IF EXISTS "Admin session full access" ON public.reels;

-- B1. banned_face_hashes — catalog (face-bans/face-violations/moderation)
CREATE POLICY pkg347_banned_face_hashes_admin_select ON public.banned_face_hashes
  FOR SELECT USING (is_active_admin_session());
CREATE POLICY pkg347_banned_face_hashes_admin_write ON public.banned_face_hashes
  FOR ALL TO authenticated
  USING (public.admin_has_any_section_permission(
    ARRAY['face-violations','face-verification','moderation','moderation-hub','live-bans','user-management'], true))
  WITH CHECK (public.admin_has_any_section_permission(
    ARRAY['face-violations','face-verification','moderation','moderation-hub','live-bans','user-management'], true));

-- B2. content_audio_tracks — catalog
CREATE POLICY pkg347_content_audio_tracks_admin_select ON public.content_audio_tracks
  FOR SELECT USING (is_active_admin_session());
CREATE POLICY pkg347_content_audio_tracks_admin_write ON public.content_audio_tracks
  FOR ALL TO authenticated
  USING (public.admin_has_any_section_permission(
    ARRAY['reels','content-hub','reel-categories','moderation','moderation-hub'], true))
  WITH CHECK (public.admin_has_any_section_permission(
    ARRAY['reels','content-hub','reel-categories','moderation','moderation-hub'], true));

-- B3. content_subtitles — catalog
CREATE POLICY pkg347_content_subtitles_admin_select ON public.content_subtitles
  FOR SELECT USING (is_active_admin_session());
CREATE POLICY pkg347_content_subtitles_admin_write ON public.content_subtitles
  FOR ALL TO authenticated
  USING (public.admin_has_any_section_permission(
    ARRAY['reels','content-hub','reel-categories','moderation','moderation-hub'], true))
  WITH CHECK (public.admin_has_any_section_permission(
    ARRAY['reels','content-hub','reel-categories','moderation','moderation-hub'], true));

-- B4. reel_categories — catalog
CREATE POLICY pkg347_reel_categories_admin_select ON public.reel_categories
  FOR SELECT USING (is_active_admin_session());
CREATE POLICY pkg347_reel_categories_admin_write ON public.reel_categories
  FOR ALL TO authenticated
  USING (public.admin_has_any_section_permission(
    ARRAY['reel-categories','reels','content-hub','moderation','moderation-hub'], true))
  WITH CHECK (public.admin_has_any_section_permission(
    ARRAY['reel-categories','reels','content-hub','moderation','moderation-hub'], true));

-- B5. reels — user-generated content + admin moderation DML
CREATE POLICY pkg347_reels_admin_select ON public.reels
  FOR SELECT USING (is_active_admin_session());
CREATE POLICY pkg347_reels_admin_write ON public.reels
  FOR ALL TO authenticated
  USING (public.admin_has_any_section_permission(
    ARRAY['reels','moderation','moderation-hub','content-hub'], true))
  WITH CHECK (public.admin_has_any_section_permission(
    ARRAY['reels','moderation','moderation-hub','content-hub'], true));

-- B6. reel_comments — admin DML for moderation
CREATE POLICY pkg347_reel_comments_admin_select ON public.reel_comments
  FOR SELECT USING (is_active_admin_session());
CREATE POLICY pkg347_reel_comments_admin_write ON public.reel_comments
  FOR ALL TO authenticated
  USING (public.admin_has_any_section_permission(
    ARRAY['reels','moderation','moderation-hub','content-hub'], true))
  WITH CHECK (public.admin_has_any_section_permission(
    ARRAY['reels','moderation','moderation-hub','content-hub'], true));

-- B7. reel_likes — engagement metric, admin DML only for moderation/cleanup
CREATE POLICY pkg347_reel_likes_admin_select ON public.reel_likes
  FOR SELECT USING (is_active_admin_session());
CREATE POLICY pkg347_reel_likes_admin_write ON public.reel_likes
  FOR ALL TO authenticated
  USING (public.admin_has_any_section_permission(
    ARRAY['reels','moderation','moderation-hub'], true))
  WITH CHECK (public.admin_has_any_section_permission(
    ARRAY['reels','moderation','moderation-hub'], true));

-- B8. reel_reports — admin DML gated by user-reports/reels
CREATE POLICY pkg347_reel_reports_admin_select ON public.reel_reports
  FOR SELECT USING (is_active_admin_session());
CREATE POLICY pkg347_reel_reports_admin_write ON public.reel_reports
  FOR ALL TO authenticated
  USING (public.admin_has_any_section_permission(
    ARRAY['user-reports','reports','reels','moderation','moderation-hub'], true))
  WITH CHECK (public.admin_has_any_section_permission(
    ARRAY['user-reports','reports','reels','moderation','moderation-hub'], true));

-- B9. reel_shares — engagement metric
CREATE POLICY pkg347_reel_shares_admin_select ON public.reel_shares
  FOR SELECT USING (is_active_admin_session());
CREATE POLICY pkg347_reel_shares_admin_write ON public.reel_shares
  FOR ALL TO authenticated
  USING (public.admin_has_any_section_permission(
    ARRAY['reels','moderation','moderation-hub'], true))
  WITH CHECK (public.admin_has_any_section_permission(
    ARRAY['reels','moderation','moderation-hub'], true));

-- ── Audit/log tables — SELECT-only for admins (writes via service_role/triggers/SECDEF) ──

-- B10. chat_moderation_logs (write happens via content-moderate edge fn w/ service-role
--      and Pkg310/Pkg281 triggers; users keep self-read)
CREATE POLICY pkg347_chat_moderation_logs_admin_select ON public.chat_moderation_logs
  FOR SELECT USING (is_active_admin_session());
CREATE POLICY pkg347_chat_moderation_logs_user_self_select ON public.chat_moderation_logs
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- B11. moderation_audit_log — tamper-proof
CREATE POLICY pkg347_moderation_audit_log_admin_select ON public.moderation_audit_log
  FOR SELECT USING (is_active_admin_session());

-- B12. reel_moderation_log — tamper-proof; admins read + users see own
CREATE POLICY pkg347_reel_moderation_log_admin_select ON public.reel_moderation_log
  FOR SELECT USING (is_active_admin_session());
CREATE POLICY pkg347_reel_moderation_log_user_self_select ON public.reel_moderation_log
  FOR SELECT TO authenticated USING (auth.uid() = user_id);