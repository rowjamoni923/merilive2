
CREATE OR REPLACE FUNCTION public.admin_apply_severity_ban(
  _target_user_id uuid,
  _severity text,
  _duration_value integer DEFAULT 0,
  _reason text DEFAULT NULL,
  _evidence jsonb DEFAULT '[]'::jsonb,
  _ban_device boolean DEFAULT NULL,
  _ban_ip boolean DEFAULT NULL,
  _ban_face boolean DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_admin_id uuid := public.current_admin_id_from_header();
  v_device_id text;
  v_last_ip text;
  v_face_hash text;
  v_rekog_face_id text;
  v_devices_banned int := 0;
  v_ips_banned int := 0;
  v_faces_banned int := 0;
  v_do_device boolean;
  v_do_ip boolean;
  v_do_face boolean;
  v_ban_end timestamptz;
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

  -- Default toggles: urgent => all true; otherwise honor caller flag (default false)
  v_do_device := COALESCE(_ban_device, _severity = 'urgent');
  v_do_ip     := COALESCE(_ban_ip,     _severity = 'urgent');
  v_do_face   := COALESCE(_ban_face,   _severity = 'urgent');

  -- Block the account
  PERFORM set_config('app.bypass_profile_protection','true',true);
  UPDATE profiles
     SET is_blocked = true, blocked_at = now(),
         blocked_reason = COALESCE(_reason, _severity || ' severity ban'),
         updated_at = now()
   WHERE id = _target_user_id
  RETURNING device_id, last_ip, face_hash
       INTO v_device_id, v_last_ip, v_face_hash;

  v_ban_end := CASE WHEN _duration_value > 0
                    THEN now() + make_interval(hours => _duration_value)
                    ELSE NULL END;

  INSERT INTO live_bans (user_id, banned_by, reason, ban_reason, severity, is_active,
                         ban_duration_hours, expires_at, ban_type, auto_banned)
  VALUES (_target_user_id, v_admin_id,
          COALESCE(_reason,_severity||' ban'), COALESCE(_reason,_severity||' ban'),
          _severity, true,
          CASE WHEN _duration_value > 0 THEN _duration_value ELSE NULL END,
          v_ban_end,
          'permanent', false);

  -- Device ban
  IF v_do_device AND v_device_id IS NOT NULL AND length(v_device_id) > 0 THEN
    INSERT INTO banned_devices (device_id, user_id, reason, banned_by, is_active)
    VALUES (v_device_id, _target_user_id, COALESCE(_reason, _severity||' ban'), v_admin_id, true)
    ON CONFLICT (device_id) DO UPDATE
      SET is_active = true,
          reason = EXCLUDED.reason,
          banned_by = EXCLUDED.banned_by,
          updated_at = now();
    v_devices_banned := 1;
  END IF;

  -- IP ban
  IF v_do_ip AND v_last_ip IS NOT NULL AND length(v_last_ip) > 0 THEN
    INSERT INTO banned_ips (ip_address, user_id, reason, banned_by, is_active)
    VALUES (v_last_ip, _target_user_id, COALESCE(_reason, _severity||' ban'), v_admin_id, true)
    ON CONFLICT (ip_address) DO UPDATE
      SET is_active = true,
          reason = EXCLUDED.reason,
          banned_by = EXCLUDED.banned_by,
          updated_at = now();
    v_ips_banned := 1;
  END IF;

  -- Face ban (profile hash + rekognition id fallback from latest verification)
  IF v_do_face THEN
    IF v_face_hash IS NULL OR length(v_face_hash) = 0 THEN
      SELECT rekognition_face_id
        INTO v_rekog_face_id
        FROM face_verification_submissions
       WHERE user_id = _target_user_id
         AND rekognition_face_id IS NOT NULL
       ORDER BY created_at DESC
       LIMIT 1;
    END IF;

    IF v_face_hash IS NOT NULL AND length(v_face_hash) > 0 THEN
      INSERT INTO banned_face_hashes (face_hash, user_id, reason, banned_by, is_active)
      VALUES (v_face_hash, _target_user_id, COALESCE(_reason, _severity||' ban'), v_admin_id, true)
      ON CONFLICT (face_hash) DO UPDATE
        SET is_active = true,
            reason = EXCLUDED.reason,
            banned_by = EXCLUDED.banned_by,
            updated_at = now();
      v_faces_banned := v_faces_banned + 1;
    END IF;

    IF v_rekog_face_id IS NOT NULL AND length(v_rekog_face_id) > 0 THEN
      INSERT INTO banned_face_hashes (face_hash, user_id, reason, banned_by, is_active)
      VALUES (v_rekog_face_id, _target_user_id, COALESCE(_reason, _severity||' ban') || ' (rekognition)', v_admin_id, true)
      ON CONFLICT (face_hash) DO UPDATE
        SET is_active = true,
            reason = EXCLUDED.reason,
            banned_by = EXCLUDED.banned_by,
            updated_at = now();
      v_faces_banned := v_faces_banned + 1;
    END IF;
  END IF;

  BEGIN
    INSERT INTO admin_logs (admin_id, action_type, target_type, target_id, details)
    VALUES (v_admin_id, 'severity_ban_'||_severity, 'user', _target_user_id,
            jsonb_build_object(
              'severity',_severity,
              'duration_hours',_duration_value,
              'reason',_reason,
              'devices_banned',v_devices_banned,
              'ips_banned',v_ips_banned,
              'faces_banned',v_faces_banned,
              'evidence',_evidence
            ));
  EXCEPTION WHEN OTHERS THEN NULL; END;

  RETURN jsonb_build_object(
    'success',true,
    'ban_end', v_ban_end,
    'devices_banned', v_devices_banned,
    'ips_banned', v_ips_banned,
    'faces_banned', v_faces_banned
  );
END $function$;
