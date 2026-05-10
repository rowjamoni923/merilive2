-- Drop any pre-existing variants (any signature) to avoid 42P13 conflicts
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT n.nspname, p.proname,
           pg_get_function_identity_arguments(p.oid) AS args
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN (
         'admin_add_user_coins','admin_add_agency_coins','admin_update_agency_level',
         'admin_block_agency','admin_agency_overview_stats','admin_change_own_password',
         'admin_clear_frame_references','admin_delete_user','admin_face_verification_stats',
         'admin_remove_face_verification','admin_toggle_face_verification',
         'admin_process_face_verification','admin_update_user_gender',
         'admin_session_block_user','admin_session_unban_live','admin_list_live_bans',
         'admin_list_face_violations','admin_update_face_violation',
         'admin_list_hosts_paginated','admin_list_severity_bans','admin_apply_severity_ban'
       )
  LOOP
    EXECUTE format('DROP FUNCTION IF EXISTS %I.%I(%s) CASCADE', r.nspname, r.proname, r.args);
  END LOOP;
END $$;

-- 1
CREATE FUNCTION public.admin_add_user_coins(_user_id uuid, _amount bigint, _note text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_new bigint;
BEGIN
  IF NOT is_active_admin_session() THEN RETURN jsonb_build_object('success',false,'error','Not authorized'); END IF;
  IF _amount IS NULL OR _amount = 0 THEN RETURN jsonb_build_object('success',false,'error','Invalid amount'); END IF;
  UPDATE profiles SET coins = GREATEST(COALESCE(coins,0)+_amount,0), updated_at = now()
   WHERE id = _user_id RETURNING coins INTO v_new;
  IF v_new IS NULL THEN RETURN jsonb_build_object('success',false,'error','User not found'); END IF;
  RETURN jsonb_build_object('success',true,'new_balance',v_new,'note',_note);
END $$;

-- 2
CREATE FUNCTION public.admin_add_agency_coins(_agency_id uuid, _amount numeric, _note text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_new numeric;
BEGIN
  IF NOT is_active_admin_session() THEN RETURN jsonb_build_object('success',false,'error','Not authorized'); END IF;
  UPDATE agencies SET diamond_balance = GREATEST(COALESCE(diamond_balance,0)+_amount,0), updated_at = now()
   WHERE id = _agency_id RETURNING diamond_balance INTO v_new;
  IF v_new IS NULL THEN RETURN jsonb_build_object('success',false,'error','Agency not found'); END IF;
  RETURN jsonb_build_object('success',true,'new_balance',v_new,'note',_note);
END $$;

-- 3
CREATE FUNCTION public.admin_update_agency_level(_agency_id uuid, _level integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_active_admin_session() THEN RETURN jsonb_build_object('success',false,'error','Not authorized'); END IF;
  UPDATE agencies SET level = _level, updated_at = now() WHERE id = _agency_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('success',false,'error','Agency not found'); END IF;
  RETURN jsonb_build_object('success',true);
END $$;

-- 4
CREATE FUNCTION public.admin_block_agency(_agency_id uuid, _block boolean, _reason text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_active_admin_session() THEN RETURN jsonb_build_object('success',false,'error','Not authorized'); END IF;
  UPDATE agencies
     SET is_blocked = _block,
         blocked_at = CASE WHEN _block THEN now() ELSE NULL END,
         blocked_reason = CASE WHEN _block THEN _reason ELSE NULL END,
         updated_at = now()
   WHERE id = _agency_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('success',false,'error','Agency not found'); END IF;
  RETURN jsonb_build_object('success',true);
END $$;

-- 5
CREATE FUNCTION public.admin_agency_overview_stats()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE r jsonb;
BEGIN
  IF NOT is_active_admin_session() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  SELECT jsonb_build_object(
    'totalAgencies',(SELECT count(*) FROM agencies),
    'activeAgencies',(SELECT count(*) FROM agencies WHERE is_active = true AND COALESCE(is_blocked,false)=false),
    'blockedAgencies',(SELECT count(*) FROM agencies WHERE COALESCE(is_blocked,false)=true),
    'totalHelpers',(SELECT count(*) FROM topup_helpers),
    'level5Helpers',(SELECT count(*) FROM topup_helpers WHERE COALESCE(level,0) >= 5),
    'totalHosts',(SELECT count(*) FROM agency_hosts),
    'totalDiamonds',(SELECT COALESCE(sum(diamond_balance),0) FROM agencies)
  ) INTO r;
  RETURN r;
END $$;

-- 6
CREATE FUNCTION public.admin_change_own_password(p_admin_user_id uuid, p_new_password text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_active_admin_session() THEN RETURN jsonb_build_object('success',false,'error','Not authorized'); END IF;
  IF p_admin_user_id <> current_admin_id_from_header() THEN
    RETURN jsonb_build_object('success',false,'error','Can only change own password');
  END IF;
  IF length(coalesce(p_new_password,'')) < 8 THEN
    RETURN jsonb_build_object('success',false,'error','Password must be at least 8 characters');
  END IF;
  UPDATE admin_users
     SET password_hash = crypt(p_new_password, gen_salt('bf')),
         password_set_at = now(), must_change_password = false, updated_at = now()
   WHERE id = p_admin_user_id;
  RETURN jsonb_build_object('success',true);
END $$;

-- 7
CREATE FUNCTION public.admin_clear_frame_references(frame_id_to_clear uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_active_admin_session() THEN RETURN jsonb_build_object('success',false,'error','Not authorized'); END IF;
  UPDATE profiles SET equipped_frame_id = NULL WHERE equipped_frame_id = frame_id_to_clear;
  UPDATE profiles SET frame_id = NULL WHERE frame_id = frame_id_to_clear;
  UPDATE profiles SET previous_frame_id = NULL WHERE previous_frame_id = frame_id_to_clear;
  DELETE FROM user_role_frames WHERE frame_id = frame_id_to_clear;
  RETURN jsonb_build_object('success',true);
END $$;

-- 8
CREATE FUNCTION public.admin_delete_user(_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_active_admin_session() THEN RETURN jsonb_build_object('success',false,'error','Not authorized'); END IF;
  UPDATE profiles
     SET is_deleted = true, is_blocked = true,
         blocked_at = now(), blocked_reason = 'Account deleted by admin',
         deletion_requested_at = COALESCE(deletion_requested_at, now()),
         deletion_scheduled_at = COALESCE(deletion_scheduled_at, now() + interval '30 days'),
         updated_at = now()
   WHERE id = _user_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('success',false,'error','User not found'); END IF;
  RETURN jsonb_build_object('success',true);
END $$;

-- 9
CREATE FUNCTION public.admin_face_verification_stats()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE r jsonb;
BEGIN
  IF NOT is_active_admin_session() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  SELECT jsonb_build_object(
    'pending',count(*) FILTER (WHERE status='pending'),
    'under_review',count(*) FILTER (WHERE status='under_review'),
    'approved',count(*) FILTER (WHERE status='approved'),
    'rejected',count(*) FILTER (WHERE status='rejected'),
    'total',count(*)
  ) INTO r FROM face_verification_submissions;
  RETURN r;
END $$;

-- 10
CREATE FUNCTION public.admin_remove_face_verification(_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_active_admin_session() THEN RETURN jsonb_build_object('success',false,'error','Not authorized'); END IF;
  UPDATE face_verification_submissions
     SET status = 'rejected', reviewed_by = current_admin_id_from_header(),
         reviewed_at = now(),
         admin_notes = COALESCE(admin_notes,'') || E'\n[Revoked by admin]'
   WHERE user_id = _user_id AND status IN ('approved','under_review');
  UPDATE profiles
     SET is_face_verified = false,
         face_verification_status = 'pending_face',
         host_status = CASE WHEN is_host THEN 'pending_face' ELSE host_status END,
         updated_at = now()
   WHERE id = _user_id;
  RETURN jsonb_build_object('success',true);
END $$;

-- 11
CREATE FUNCTION public.admin_toggle_face_verification(_user_id uuid, _verified boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_active_admin_session() THEN RETURN jsonb_build_object('success',false,'error','Not authorized'); END IF;
  UPDATE profiles
     SET is_face_verified = _verified,
         face_verified_at = CASE WHEN _verified THEN now() ELSE NULL END,
         face_verification_status = CASE WHEN _verified THEN 'approved' ELSE 'pending_face' END,
         host_status = CASE
           WHEN _verified AND is_host THEN 'approved'
           WHEN NOT _verified AND is_host THEN 'pending_face'
           ELSE host_status END,
         updated_at = now()
   WHERE id = _user_id;
  RETURN jsonb_build_object('success',true);
END $$;

-- 12
CREATE FUNCTION public.admin_process_face_verification(
  _submission_id uuid, _action text,
  _reason text DEFAULT NULL, _approve_as text DEFAULT 'host', _set_gender text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user uuid;
BEGIN
  IF NOT is_active_admin_session() THEN RETURN jsonb_build_object('success',false,'error','Not authorized'); END IF;
  SELECT user_id INTO v_user FROM face_verification_submissions WHERE id = _submission_id;
  IF v_user IS NULL THEN RETURN jsonb_build_object('success',false,'error','Submission not found'); END IF;
  UPDATE face_verification_submissions
     SET status = CASE WHEN _action='approve' THEN 'approved' ELSE 'rejected' END,
         reviewed_by = current_admin_id_from_header(), reviewed_at = now(),
         admin_notes = COALESCE(_reason, admin_notes),
         rejection_reason = CASE WHEN _action='reject' THEN _reason ELSE rejection_reason END
   WHERE id = _submission_id;
  IF _action = 'approve' THEN
    UPDATE profiles
       SET is_face_verified = true, face_verified_at = now(),
           face_verification_status = 'approved',
           gender = COALESCE(_set_gender, gender),
           is_host = CASE WHEN _approve_as='host' OR COALESCE(_set_gender, gender)='female' THEN true ELSE COALESCE(is_host,false) END,
           host_status = CASE WHEN _approve_as='host' OR COALESCE(_set_gender, gender)='female' THEN 'approved' ELSE host_status END,
           updated_at = now()
     WHERE id = v_user;
  ELSE
    UPDATE profiles
       SET is_face_verified = false, face_verification_status = 'rejected',
           host_status = CASE WHEN is_host THEN 'rejected' ELSE host_status END,
           updated_at = now()
     WHERE id = v_user;
  END IF;
  RETURN jsonb_build_object('success',true);
END $$;

-- 13
CREATE FUNCTION public.admin_update_user_gender(_user_id uuid, _gender text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_active_admin_session() THEN RETURN jsonb_build_object('success',false,'error','Not authorized'); END IF;
  IF _gender NOT IN ('female','male') THEN RETURN jsonb_build_object('success',false,'error','Invalid gender'); END IF;
  UPDATE profiles
     SET gender = _gender,
         is_host = CASE WHEN _gender='female' THEN true ELSE false END,
         host_status = CASE
           WHEN _gender='female' AND COALESCE(is_face_verified,false) THEN 'approved'
           WHEN _gender='female' THEN 'pending_face'
           ELSE NULL END,
         updated_at = now()
   WHERE id = _user_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('success',false,'error','User not found'); END IF;
  RETURN jsonb_build_object('success',true);
END $$;

-- 14
CREATE FUNCTION public.admin_session_block_user(_admin_id uuid, _user_id uuid, _block boolean, _reason text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_active_admin_session() THEN RETURN jsonb_build_object('success',false,'error','Not authorized'); END IF;
  UPDATE profiles
     SET is_blocked = _block,
         blocked_at = CASE WHEN _block THEN now() ELSE NULL END,
         blocked_reason = CASE WHEN _block THEN _reason ELSE NULL END,
         updated_at = now()
   WHERE id = _user_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('success',false,'error','User not found'); END IF;
  RETURN jsonb_build_object('success',true);
END $$;

-- 15
CREATE FUNCTION public.admin_session_unban_live(_admin_id uuid, _ban_id uuid, _reason text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_active_admin_session() THEN RETURN jsonb_build_object('success',false,'error','Not authorized'); END IF;
  UPDATE live_bans
     SET is_active = false, unbanned_by = current_admin_id_from_header(),
         unbanned_at = now(), unban_reason = _reason
   WHERE id = _ban_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('success',false,'error','Ban not found'); END IF;
  RETURN jsonb_build_object('success',true);
END $$;

-- 16
CREATE FUNCTION public.admin_list_live_bans(_only_active boolean DEFAULT false, _limit integer DEFAULT 200)
RETURNS SETOF live_bans LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_active_admin_session() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  RETURN QUERY SELECT * FROM live_bans
   WHERE (NOT _only_active OR is_active = true)
   ORDER BY created_at DESC LIMIT GREATEST(_limit,1);
END $$;

-- 17
CREATE FUNCTION public.admin_list_face_violations(_admin_id uuid DEFAULT NULL, _limit integer DEFAULT 200)
RETURNS TABLE(id uuid, host_id uuid, stream_id uuid, violation_type text,
  frame_url text, confidence numeric, action_taken text, status text,
  created_at timestamptz, display_name text, app_uid text, avatar_url text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_active_admin_session() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  RETURN QUERY
    SELECT v.id, v.host_id, v.stream_id, v.violation_type,
           v.frame_url, v.confidence, v.action_taken, v.status, v.created_at,
           p.display_name, p.app_uid, p.avatar_url
      FROM live_face_violations v
      LEFT JOIN profiles p ON p.id = v.host_id
     ORDER BY v.created_at DESC LIMIT GREATEST(_limit,1);
END $$;

-- 18
CREATE FUNCTION public.admin_update_face_violation(_admin_id uuid, _violation_id uuid, _status text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_active_admin_session() THEN RETURN jsonb_build_object('success',false,'error','Not authorized'); END IF;
  UPDATE live_face_violations
     SET status = _status, reviewed_by = current_admin_id_from_header(), reviewed_at = now()
   WHERE id = _violation_id;
  RETURN jsonb_build_object('success',FOUND);
END $$;

-- 19
CREATE FUNCTION public.admin_list_hosts_paginated(
  _status text DEFAULT NULL, _search text DEFAULT NULL,
  _limit integer DEFAULT 50, _offset integer DEFAULT 0
) RETURNS TABLE(
  id uuid, display_name text, app_uid text, avatar_url text,
  gender text, host_status text, is_face_verified boolean,
  agency_id uuid, total_earnings bigint, beans bigint,
  created_at timestamptz, total_count bigint
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_total bigint;
BEGIN
  IF NOT is_active_admin_session() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  SELECT count(*) INTO v_total FROM profiles p
   WHERE COALESCE(p.is_host,false) = true
     AND (_status IS NULL OR p.host_status = _status)
     AND (_search IS NULL OR p.display_name ILIKE '%'||_search||'%' OR p.app_uid ILIKE '%'||_search||'%');
  RETURN QUERY
    SELECT p.id, p.display_name, p.app_uid, p.avatar_url, p.gender,
           p.host_status, p.is_face_verified, p.agency_id,
           COALESCE(p.total_earnings,0)::bigint, COALESCE(p.beans,0)::bigint,
           p.created_at, v_total
      FROM profiles p
     WHERE COALESCE(p.is_host,false) = true
       AND (_status IS NULL OR p.host_status = _status)
       AND (_search IS NULL OR p.display_name ILIKE '%'||_search||'%' OR p.app_uid ILIKE '%'||_search||'%')
     ORDER BY p.created_at DESC LIMIT GREATEST(_limit,1) OFFSET GREATEST(_offset,0);
END $$;

-- 20
CREATE FUNCTION public.admin_list_severity_bans(_severity text, _limit integer DEFAULT 200)
RETURNS TABLE(id uuid, target_user_id uuid, severity text, reason text,
  evidence jsonb, duration_value integer, status text,
  created_at timestamptz, display_name text, app_uid text, avatar_url text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_active_admin_session() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  RETURN QUERY
    SELECT c.id, t.target_user_id, c.severity::text, c.reason,
           c.evidence, c.duration_value, c.status::text, c.created_at,
           p.display_name, p.app_uid, p.avatar_url
      FROM admin_permanent_ban_cases c
      LEFT JOIN admin_permanent_ban_case_targets t ON t.case_id = c.id
      LEFT JOIN profiles p ON p.id = t.target_user_id
     WHERE c.severity::text = _severity
     ORDER BY c.created_at DESC LIMIT GREATEST(_limit,1);
EXCEPTION WHEN undefined_column OR undefined_table THEN
  RETURN;
END $$;

-- 21
CREATE FUNCTION public.admin_apply_severity_ban(
  _target_user_id uuid, _severity text,
  _duration_value integer DEFAULT 0, _reason text DEFAULT NULL,
  _evidence jsonb DEFAULT '[]'::jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_active_admin_session() THEN RETURN jsonb_build_object('success',false,'error','Not authorized'); END IF;
  UPDATE profiles
     SET is_blocked = true, blocked_at = now(),
         blocked_reason = COALESCE(_reason, _severity || ' severity ban'),
         updated_at = now()
   WHERE id = _target_user_id;
  INSERT INTO live_bans (user_id, banned_by, reason, ban_reason, severity, is_active, ban_duration_hours, expires_at, ban_type, auto_banned)
  VALUES (_target_user_id, current_admin_id_from_header(),
          COALESCE(_reason,_severity||' ban'), COALESCE(_reason,_severity||' ban'),
          _severity, true,
          CASE WHEN _duration_value > 0 THEN _duration_value ELSE NULL END,
          CASE WHEN _duration_value > 0 THEN now()+make_interval(hours => _duration_value) ELSE NULL END,
          'permanent', false);
  RETURN jsonb_build_object('success',true);
END $$;

-- Grants
DO $$
DECLARE fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'admin_add_user_coins(uuid,bigint,text)',
    'admin_add_agency_coins(uuid,numeric,text)',
    'admin_update_agency_level(uuid,integer)',
    'admin_block_agency(uuid,boolean,text)',
    'admin_agency_overview_stats()',
    'admin_change_own_password(uuid,text)',
    'admin_clear_frame_references(uuid)',
    'admin_delete_user(uuid)',
    'admin_face_verification_stats()',
    'admin_remove_face_verification(uuid)',
    'admin_toggle_face_verification(uuid,boolean)',
    'admin_process_face_verification(uuid,text,text,text,text)',
    'admin_update_user_gender(uuid,text)',
    'admin_session_block_user(uuid,uuid,boolean,text)',
    'admin_session_unban_live(uuid,uuid,text)',
    'admin_list_live_bans(boolean,integer)',
    'admin_list_face_violations(uuid,integer)',
    'admin_update_face_violation(uuid,uuid,text)',
    'admin_list_hosts_paginated(text,text,integer,integer)',
    'admin_list_severity_bans(text,integer)',
    'admin_apply_severity_ban(uuid,text,integer,text,jsonb)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO anon, authenticated', fn);
  END LOOP;
END $$;
