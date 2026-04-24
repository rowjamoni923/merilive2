-- User Reports
CREATE OR REPLACE FUNCTION public.admin_list_user_reports(_admin_id uuid, _status text DEFAULT NULL, _limit int DEFAULT 200)
RETURNS SETOF public.user_reports LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT * FROM public.user_reports
  WHERE public.is_admin_session(_admin_id) AND (_status IS NULL OR status = _status)
  ORDER BY created_at DESC LIMIT _limit;
$$;
CREATE OR REPLACE FUNCTION public.admin_update_user_report(_admin_id uuid, _report_id uuid, _status text, _admin_note text DEFAULT NULL)
RETURNS public.user_reports LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.user_reports;
BEGIN
  IF NOT public.is_admin_session(_admin_id) THEN RAISE EXCEPTION 'unauthorized'; END IF;
  UPDATE public.user_reports SET status=_status, admin_notes=COALESCE(_admin_note, admin_notes), reviewed_at=now(), reviewed_by=_admin_id WHERE id=_report_id RETURNING * INTO r;
  RETURN r;
END;$$;

-- Face Violations
CREATE OR REPLACE FUNCTION public.admin_list_face_violations(_admin_id uuid, _limit int DEFAULT 200)
RETURNS TABLE(id uuid, host_id uuid, stream_id uuid, violation_type text, frame_url text, confidence numeric, action_taken text, status text, created_at timestamptz, reviewed_at timestamptz, display_name text, app_uid text)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT v.id, v.host_id, v.stream_id, v.violation_type, v.frame_url, v.confidence, v.action_taken, v.status, v.created_at, v.reviewed_at, p.display_name, p.app_uid
  FROM public.live_face_violations v
  LEFT JOIN public.profiles p ON p.id = v.host_id
  WHERE public.is_admin_session(_admin_id)
  ORDER BY v.created_at DESC LIMIT _limit;
$$;
CREATE OR REPLACE FUNCTION public.admin_update_face_violation(_admin_id uuid, _violation_id uuid, _status text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin_session(_admin_id) THEN RAISE EXCEPTION 'unauthorized'; END IF;
  UPDATE public.live_face_violations SET status=_status, reviewed_at=now(), reviewed_by=_admin_id WHERE id=_violation_id;
END;$$;

-- Country Distribution
CREATE OR REPLACE FUNCTION public.admin_country_distribution(_admin_id uuid)
RETURNS TABLE(country_code text, country_name text, country_flag text, total bigint)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(country_code, 'XX')::text, COALESCE(country_name, 'Unknown')::text, COALESCE(country_flag, '🏳️')::text, COUNT(*)::bigint
  FROM public.profiles
  WHERE public.is_admin_session(_admin_id)
  GROUP BY COALESCE(country_code, 'XX'), COALESCE(country_name, 'Unknown'), COALESCE(country_flag, '🏳️')
  ORDER BY 4 DESC;
$$;

-- Recordings
CREATE OR REPLACE FUNCTION public.admin_list_recordings(_admin_id uuid, _limit int DEFAULT 200)
RETURNS SETOF public.stream_recordings LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT * FROM public.stream_recordings WHERE public.is_admin_session(_admin_id) ORDER BY created_at DESC LIMIT _limit;
$$;
CREATE OR REPLACE FUNCTION public.admin_delete_recording(_admin_id uuid, _recording_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin_session(_admin_id) THEN RAISE EXCEPTION 'unauthorized'; END IF;
  DELETE FROM public.stream_recordings WHERE id=_recording_id;
END;$$;

-- Reels
CREATE OR REPLACE FUNCTION public.admin_list_reels(_admin_id uuid, _limit int DEFAULT 200)
RETURNS SETOF public.reels LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT * FROM public.reels WHERE public.is_admin_session(_admin_id) ORDER BY created_at DESC LIMIT _limit;
$$;
CREATE OR REPLACE FUNCTION public.admin_delete_reel(_admin_id uuid, _reel_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin_session(_admin_id) THEN RAISE EXCEPTION 'unauthorized'; END IF;
  DELETE FROM public.reels WHERE id=_reel_id;
END;$$;

-- Streams
CREATE OR REPLACE FUNCTION public.admin_list_streams(_admin_id uuid, _limit int DEFAULT 200)
RETURNS SETOF public.live_streams LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT * FROM public.live_streams WHERE public.is_admin_session(_admin_id)
  ORDER BY started_at DESC NULLS LAST LIMIT _limit;
$$;
CREATE OR REPLACE FUNCTION public.admin_end_stream(_admin_id uuid, _stream_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin_session(_admin_id) THEN RAISE EXCEPTION 'unauthorized'; END IF;
  UPDATE public.live_streams SET status='ended', ended_at=COALESCE(ended_at, now()) WHERE id=_stream_id;
END;$$;

-- Helper Applications
CREATE OR REPLACE FUNCTION public.admin_list_helper_applications(_admin_id uuid, _status text DEFAULT NULL)
RETURNS SETOF public.helper_applications LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT * FROM public.helper_applications
  WHERE public.is_admin_session(_admin_id) AND (_status IS NULL OR status = _status)
  ORDER BY created_at DESC;
$$;
CREATE OR REPLACE FUNCTION public.admin_update_helper_application(_admin_id uuid, _app_id uuid, _status text, _notes text DEFAULT NULL)
RETURNS public.helper_applications LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.helper_applications;
BEGIN
  IF NOT public.is_admin_session(_admin_id) THEN RAISE EXCEPTION 'unauthorized'; END IF;
  UPDATE public.helper_applications SET status=_status, notes=COALESCE(_notes, notes), reviewed_at=now(), reviewed_by=_admin_id WHERE id=_app_id RETURNING * INTO r;
  RETURN r;
END;$$;

-- Helper Upgrade/Topup
CREATE OR REPLACE FUNCTION public.admin_list_helper_upgrade_requests(_admin_id uuid)
RETURNS SETOF public.helper_upgrade_requests LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT * FROM public.helper_upgrade_requests WHERE public.is_admin_session(_admin_id) ORDER BY created_at DESC;
$$;
CREATE OR REPLACE FUNCTION public.admin_list_helper_topup_requests(_admin_id uuid)
RETURNS SETOF public.helper_topup_requests LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT * FROM public.helper_topup_requests WHERE public.is_admin_session(_admin_id) ORDER BY created_at DESC;
$$;

-- Helper Orders
CREATE OR REPLACE FUNCTION public.admin_list_helper_orders(_admin_id uuid, _limit int DEFAULT 300)
RETURNS SETOF public.helper_orders LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT * FROM public.helper_orders WHERE public.is_admin_session(_admin_id) ORDER BY created_at DESC LIMIT _limit;
$$;

-- Topup Helpers
CREATE OR REPLACE FUNCTION public.admin_list_topup_helpers(_admin_id uuid)
RETURNS SETOF public.topup_helpers LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT * FROM public.topup_helpers WHERE public.is_admin_session(_admin_id) ORDER BY created_at DESC;
$$;

-- Agency Policy
CREATE OR REPLACE FUNCTION public.admin_upsert_agency_policy(_admin_id uuid, _section_key text, _section_title text, _content jsonb, _display_order int DEFAULT 0, _is_active boolean DEFAULT true)
RETURNS public.agency_policy_settings LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.agency_policy_settings;
BEGIN
  IF NOT public.is_admin_session(_admin_id) THEN RAISE EXCEPTION 'unauthorized'; END IF;
  INSERT INTO public.agency_policy_settings (section_key, section_title, content, display_order, is_active)
  VALUES (_section_key, _section_title, _content, _display_order, _is_active)
  ON CONFLICT (section_key) DO UPDATE SET section_title=EXCLUDED.section_title, content=EXCLUDED.content, display_order=EXCLUDED.display_order, is_active=EXCLUDED.is_active, updated_at=now()
  RETURNING * INTO r;
  RETURN r;
END;$$;
CREATE OR REPLACE FUNCTION public.admin_delete_agency_policy(_admin_id uuid, _id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin_session(_admin_id) THEN RAISE EXCEPTION 'unauthorized'; END IF;
  DELETE FROM public.agency_policy_settings WHERE id=_id;
END;$$;

-- Grants
GRANT EXECUTE ON FUNCTION public.admin_list_user_reports(uuid,text,int) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_user_report(uuid,uuid,text,text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_face_violations(uuid,int) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_face_violation(uuid,uuid,text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_country_distribution(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_recordings(uuid,int) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_recording(uuid,uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_reels(uuid,int) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_reel(uuid,uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_streams(uuid,int) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_end_stream(uuid,uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_helper_applications(uuid,text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_helper_application(uuid,uuid,text,text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_helper_upgrade_requests(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_helper_topup_requests(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_helper_orders(uuid,int) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_topup_helpers(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_upsert_agency_policy(uuid,text,text,jsonb,int,boolean) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_agency_policy(uuid,uuid) TO anon, authenticated;