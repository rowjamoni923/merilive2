-- Pkg321 honest deep-scan hardening: stop direct/internal admin RPC bypasses

CREATE OR REPLACE FUNCTION public.current_effective_admin_id()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_id uuid;
BEGIN
  v_admin_id := public.current_admin_id_from_header();
  IF v_admin_id IS NOT NULL THEN
    RETURN v_admin_id;
  END IF;

  IF auth.uid() IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT id INTO v_admin_id
  FROM public.admin_users
  WHERE user_id = auth.uid()
    AND is_active = true
  LIMIT 1;

  RETURN v_admin_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.current_effective_admin_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role::text
  FROM public.admin_users
  WHERE id = public.current_effective_admin_id()
    AND is_active = true
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.admin_has_section_permission(_section_key text, _require_edit boolean DEFAULT false)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH me AS (
    SELECT id, role::text AS role
    FROM public.admin_users
    WHERE id = public.current_effective_admin_id()
      AND is_active = true
    LIMIT 1
  )
  SELECT COALESCE(
    (SELECT true FROM me WHERE role = 'owner'),
    EXISTS (
      SELECT 1
      FROM me
      JOIN public.admin_section_permissions asp ON asp.admin_user_id = me.id
      JOIN public.admin_sections s ON s.id = asp.section_id
      WHERE s.section_key = _section_key
        AND s.is_active = true
        AND CASE WHEN _require_edit THEN asp.can_edit = true ELSE asp.can_view = true END
    ),
    false
  );
$$;

CREATE OR REPLACE FUNCTION public.admin_has_any_section_permission(_section_keys text[], _require_edit boolean DEFAULT false)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM unnest(COALESCE(_section_keys, ARRAY[]::text[])) AS k(section_key)
    WHERE public.admin_has_section_permission(k.section_key, _require_edit)
  );
$$;

CREATE OR REPLACE FUNCTION public._current_admin_display()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(support_display_name, display_name, email)
  FROM public.admin_users
  WHERE id = public.current_effective_admin_id()
    AND is_active = true;
$$;

CREATE OR REPLACE FUNCTION public._current_admin_role()
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
BEGIN
  SELECT role::text INTO v_role
  FROM public.admin_users
  WHERE id = public.current_effective_admin_id()
    AND is_active = true;
  RETURN v_role;
END;
$$;

CREATE OR REPLACE FUNCTION public._enqueue_admin_pending_action(
  _action_type text,
  _target_user uuid,
  _target_agency uuid,
  _payload jsonb,
  _reason text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_admin uuid := public.current_effective_admin_id();
  v_role text := public.current_effective_admin_role();
  v_name text := public._current_admin_display();
  v_owner record;
  v_label text;
BEGIN
  IF v_admin IS NULL OR v_role IS NULL THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF _action_type NOT IN (
    'add_diamonds', 'add_beans', 'agency_beans_adjust', 'update_gender',
    'process_face_verification', 'remove_face_verification', 'reverse_auto_action'
  ) THEN
    RAISE EXCEPTION 'Unsupported pending action type: %', _action_type;
  END IF;

  INSERT INTO public.admin_pending_actions(action_type, target_user_id, target_agency_id, payload, reason, requested_by, requested_by_name)
  VALUES (_action_type, _target_user, _target_agency, COALESCE(_payload,'{}'::jsonb), _reason, v_admin, v_name)
  RETURNING id INTO v_id;

  v_label := CASE _action_type
    WHEN 'add_diamonds' THEN 'Diamond credit'
    WHEN 'add_beans' THEN 'Beans credit'
    WHEN 'agency_beans_adjust' THEN 'Agency beans adjust'
    WHEN 'update_gender' THEN 'Gender change'
    WHEN 'process_face_verification' THEN 'Face verification decision'
    WHEN 'remove_face_verification' THEN 'Face verification revoke'
    ELSE _action_type END;

  FOR v_owner IN SELECT user_id FROM public.admin_users WHERE role = 'owner' AND is_active = true AND user_id IS NOT NULL LOOP
    BEGIN
      INSERT INTO public.notifications(user_id, type, title, body, data)
      VALUES (
        v_owner.user_id,
        'admin_pending_action',
        'Pending approval: ' || v_label,
        COALESCE(v_name,'Sub-admin') || ' requested: ' || v_label,
        jsonb_build_object('pending_id', v_id, 'action_type', _action_type, 'requested_by_name', v_name)
      );
    EXCEPTION WHEN others THEN
      NULL;
    END;
  END LOOP;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public._execute_admin_pending_action(_action_type text, _payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid;
  v_amount integer;
  v_agency uuid;
  v_delta bigint;
  v_gender text;
  v_submission uuid;
  v_action text;
  v_reason text;
  v_set_gender text;
  v_role text := public.current_effective_admin_role();
  v_is_service boolean := COALESCE(current_setting('request.jwt.claim.role', true), '') = 'service_role';
BEGIN
  IF NOT v_is_service AND v_role <> 'owner' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Owner approval required');
  END IF;

  IF _action_type NOT IN (
    'add_diamonds', 'add_beans', 'agency_beans_adjust', 'update_gender',
    'process_face_verification', 'remove_face_verification', 'reverse_auto_action'
  ) THEN
    RAISE EXCEPTION 'Unknown action_type: %', _action_type;
  END IF;

  IF _action_type = 'add_diamonds' THEN
    v_user := (_payload->>'user_id')::uuid;
    v_amount := (_payload->>'amount')::int;
    IF v_user IS NULL OR v_amount IS NULL OR v_amount = 0 OR abs(v_amount) > 10000000 THEN
      RETURN jsonb_build_object('success', false, 'error', 'Invalid diamond amount');
    END IF;
    PERFORM set_config('app.bypass_profile_protection','true',true);
    UPDATE public.profiles SET coins = GREATEST(COALESCE(coins,0) + v_amount, 0), updated_at = now() WHERE id = v_user;
    RETURN jsonb_build_object('success',true);

  ELSIF _action_type = 'add_beans' THEN
    v_user := (_payload->>'user_id')::uuid;
    v_amount := (_payload->>'amount')::int;
    IF v_user IS NULL OR v_amount IS NULL OR v_amount = 0 OR abs(v_amount) > 10000000 THEN
      RETURN jsonb_build_object('success', false, 'error', 'Invalid bean amount');
    END IF;
    PERFORM set_config('app.bypass_profile_protection','true',true);
    UPDATE public.profiles SET beans = GREATEST(COALESCE(beans,0) + v_amount, 0), updated_at = now() WHERE id = v_user;
    RETURN jsonb_build_object('success',true);

  ELSIF _action_type = 'agency_beans_adjust' THEN
    v_agency := (_payload->>'agency_id')::uuid;
    v_delta := (_payload->>'delta')::bigint;
    IF v_agency IS NULL OR v_delta IS NULL OR v_delta = 0 OR abs(v_delta) > 1000000000 THEN
      RETURN jsonb_build_object('success', false, 'error', 'Invalid agency bean adjustment');
    END IF;
    PERFORM set_config('app.bypass_agency_economy_guard','true',true);
    UPDATE public.agencies SET beans_balance = GREATEST(COALESCE(beans_balance,0) + v_delta, 0), updated_at = now() WHERE id = v_agency;
    RETURN jsonb_build_object('success',true);

  ELSIF _action_type = 'update_gender' THEN
    v_user := (_payload->>'user_id')::uuid;
    v_gender := _payload->>'gender';
    IF v_user IS NULL OR v_gender NOT IN ('female','male') THEN RETURN jsonb_build_object('success',false,'error','Invalid gender'); END IF;
    PERFORM set_config('app.bypass_profile_protection','true',true);
    UPDATE public.profiles SET gender = v_gender,
       is_host = CASE WHEN v_gender='female' THEN true ELSE false END,
       host_status = CASE WHEN v_gender='female' AND COALESCE(is_face_verified,false) THEN 'approved'
                          WHEN v_gender='female' THEN 'pending_face' ELSE NULL END,
       updated_at = now() WHERE id = v_user;
    RETURN jsonb_build_object('success',true);

  ELSIF _action_type = 'process_face_verification' THEN
    v_submission := (_payload->>'submission_id')::uuid;
    v_action := _payload->>'action';
    v_reason := _payload->>'reason';
    v_set_gender := _payload->>'set_gender';
    IF v_submission IS NULL OR v_action NOT IN ('approve','reject') THEN
      RETURN jsonb_build_object('success', false, 'error', 'Invalid face verification action');
    END IF;
    SELECT user_id INTO v_user FROM public.face_verification_submissions WHERE id = v_submission;
    IF v_user IS NULL THEN RETURN jsonb_build_object('success',false,'error','Submission not found'); END IF;
    UPDATE public.face_verification_submissions
       SET status = CASE WHEN v_action='approve' THEN 'approved' ELSE 'rejected' END,
           reviewed_by = public.current_effective_admin_id(), reviewed_at = now(),
           admin_notes = COALESCE(v_reason, admin_notes),
           rejection_reason = CASE WHEN v_action='reject' THEN v_reason ELSE rejection_reason END,
           updated_at = now()
     WHERE id = v_submission;
    PERFORM set_config('app.bypass_profile_protection','true',true);
    IF v_action='approve' THEN
      v_gender := lower(trim(COALESCE(NULLIF(trim(COALESCE(v_set_gender,'')),''),
                  (SELECT lower(trim(COALESCE(p.gender,''))) FROM public.profiles p WHERE p.id = v_user),'male')));
      IF v_gender NOT IN ('female','male') THEN v_gender := 'male'; END IF;
      UPDATE public.face_verification_submissions
         SET verification_type = CASE WHEN v_gender='female' THEN 'host' ELSE 'user' END, updated_at = now()
       WHERE id = v_submission;
      UPDATE public.profiles SET is_face_verified=true, face_verified_at=now(), face_verification_status='approved',
                          gender=v_gender, is_host=(v_gender='female'),
                          host_status = CASE WHEN v_gender='female' THEN 'approved' ELSE NULL END,
                          updated_at=now() WHERE id = v_user;
    ELSE
      UPDATE public.profiles SET is_face_verified=false, face_verification_status='rejected',
                          host_status = CASE WHEN is_host THEN 'rejected' ELSE host_status END,
                          updated_at=now() WHERE id = v_user;
    END IF;
    RETURN jsonb_build_object('success',true);

  ELSIF _action_type = 'remove_face_verification' THEN
    v_user := (_payload->>'user_id')::uuid;
    IF v_user IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Invalid user'); END IF;
    UPDATE public.face_verification_submissions
       SET status='rejected', reviewed_by=public.current_effective_admin_id(), reviewed_at=now(),
           admin_notes = COALESCE(admin_notes,'') || E'\n[Revoked by admin]', updated_at = now()
     WHERE user_id = v_user AND status IN ('approved','under_review');
    PERFORM set_config('app.bypass_profile_protection','true',true);
    UPDATE public.profiles SET is_face_verified=false, face_verification_status='pending_face',
                        host_status = CASE WHEN is_host THEN 'pending_face' ELSE host_status END,
                        updated_at=now() WHERE id = v_user;
    RETURN jsonb_build_object('success',true);

  ELSIF _action_type = 'reverse_auto_action' THEN
    RETURN public._do_reverse_auto_action(
      _payload->>'action_type',
      (_payload->>'action_id')::uuid,
      _payload->>'reason',
      public.current_effective_admin_id()
    );
  END IF;

  RAISE EXCEPTION 'Unknown action_type: %', _action_type;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_add_user_coins(_user_id uuid, _amount bigint, _note text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new bigint;
  v_role text := public.current_effective_admin_role();
  v_pending uuid;
BEGIN
  IF NOT public.admin_has_any_section_permission(ARRAY['manual-topup','topup-system','finance-hub','user-management'], true) THEN
    RETURN jsonb_build_object('success',false,'error','Not authorized');
  END IF;
  IF _amount IS NULL OR _amount = 0 OR abs(_amount) > 10000000 THEN
    RETURN jsonb_build_object('success',false,'error','Invalid amount');
  END IF;
  IF v_role = 'sub_admin' THEN
    v_pending := public._enqueue_admin_pending_action('add_diamonds', _user_id, NULL, jsonb_build_object('user_id', _user_id, 'amount', _amount), _note);
    RETURN jsonb_build_object('pending', true, 'request_id', v_pending);
  END IF;
  PERFORM set_config('app.bypass_profile_protection','true',true);
  UPDATE public.profiles SET coins = GREATEST(COALESCE(coins,0)+_amount,0), updated_at = now()
   WHERE id = _user_id RETURNING coins INTO v_new;
  IF v_new IS NULL THEN RETURN jsonb_build_object('success',false,'error','User not found'); END IF;
  RETURN jsonb_build_object('success',true,'new_balance',v_new,'note',_note);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_add_agency_coins(_agency_id uuid, _amount numeric, _note text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new numeric;
BEGIN
  IF NOT public.admin_has_section_permission('agency-management', true) THEN
    RETURN jsonb_build_object('success',false,'error','Not authorized');
  END IF;
  IF public.current_effective_admin_role() <> 'owner' THEN
    RETURN jsonb_build_object('success',false,'error','Owner approval required');
  END IF;
  IF _amount IS NULL OR _amount = 0 OR abs(_amount) > 10000000 THEN
    RETURN jsonb_build_object('success',false,'error','Invalid amount');
  END IF;
  PERFORM set_config('app.bypass_agency_economy_guard','true',true);
  UPDATE public.agencies SET diamond_balance = GREATEST(COALESCE(diamond_balance,0)+_amount,0), updated_at = now()
   WHERE id = _agency_id RETURNING diamond_balance INTO v_new;
  IF v_new IS NULL THEN RETURN jsonb_build_object('success',false,'error','Agency not found'); END IF;
  RETURN jsonb_build_object('success',true,'new_balance',v_new,'note',_note);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_adjust_agency_beans(_agency_id uuid, _delta bigint, _reason text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
  v_pending uuid;
BEGIN
  IF NOT public.admin_has_section_permission('agency-management', true) THEN
    RETURN jsonb_build_object('success',false,'error','Not authorized');
  END IF;
  IF _delta IS NULL OR _delta = 0 OR abs(_delta) > 1000000000 THEN
    RETURN jsonb_build_object('success',false,'error','Invalid amount');
  END IF;
  v_role := public.current_effective_admin_role();
  IF v_role = 'sub_admin' THEN
    v_pending := public._enqueue_admin_pending_action('agency_beans_adjust', NULL, _agency_id,
      jsonb_build_object('agency_id',_agency_id,'delta',_delta), _reason);
    RETURN jsonb_build_object('pending', true, 'request_id', v_pending);
  END IF;
  RETURN public._execute_admin_pending_action('agency_beans_adjust',
    jsonb_build_object('agency_id',_agency_id,'delta',_delta));
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_delete_user(_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.current_effective_admin_role() <> 'owner' OR NOT public.admin_has_section_permission('user-management', true) THEN
    RETURN jsonb_build_object('success',false,'error','Owner user-management permission required');
  END IF;
  PERFORM set_config('app.bypass_profile_protection','true',true);
  UPDATE public.profiles
     SET is_deleted = true, is_blocked = true,
         blocked_at = now(), blocked_reason = 'Account deleted by admin',
         deletion_requested_at = COALESCE(deletion_requested_at, now()),
         deletion_scheduled_at = COALESCE(deletion_scheduled_at, now() + interval '30 days'),
         updated_at = now()
   WHERE id = _user_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('success',false,'error','User not found'); END IF;
  RETURN jsonb_build_object('success',true);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_update_user_gender(_user_id uuid, _gender text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
  v_pending uuid;
BEGIN
  IF NOT public.admin_has_any_section_permission(ARRAY['user-management','host-applications','face-verification','all-hosts'], true) THEN
    RETURN jsonb_build_object('success',false,'error','Not authorized');
  END IF;
  IF _gender NOT IN ('female','male') THEN RETURN jsonb_build_object('success',false,'error','Invalid gender'); END IF;
  v_role := public.current_effective_admin_role();
  IF v_role = 'sub_admin' THEN
    v_pending := public._enqueue_admin_pending_action('update_gender', _user_id, NULL,
      jsonb_build_object('user_id',_user_id,'gender',_gender), NULL);
    RETURN jsonb_build_object('pending', true, 'request_id', v_pending);
  END IF;
  RETURN public._execute_admin_pending_action('update_gender', jsonb_build_object('user_id',_user_id,'gender',_gender));
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_toggle_face_verification(_user_id uuid, _verified boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pending uuid;
BEGIN
  IF NOT public.admin_has_any_section_permission(ARRAY['face-verification','host-applications','user-management'], true) THEN
    RETURN jsonb_build_object('success',false,'error','Not authorized');
  END IF;
  IF public.current_effective_admin_role() = 'sub_admin' THEN
    IF _verified IS FALSE THEN
      v_pending := public._enqueue_admin_pending_action('remove_face_verification', _user_id, NULL, jsonb_build_object('user_id', _user_id), NULL);
      RETURN jsonb_build_object('pending', true, 'request_id', v_pending);
    END IF;
    RETURN jsonb_build_object('success',false,'error','Owner approval required');
  END IF;
  PERFORM set_config('app.bypass_profile_protection','true',true);
  UPDATE public.profiles
     SET is_face_verified = _verified,
         face_verified_at = CASE WHEN _verified THEN now() ELSE NULL END,
         face_verification_status = CASE WHEN _verified THEN 'approved' ELSE 'pending_face' END,
         host_status = CASE
           WHEN _verified AND is_host THEN 'approved'
           WHEN NOT _verified AND is_host THEN 'pending_face'
           ELSE host_status END,
         updated_at = now()
   WHERE id = _user_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('success',false,'error','User not found'); END IF;
  RETURN jsonb_build_object('success',true);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_add_owner(_admin_id uuid, _new_email text, _display_name text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_id uuid := public.current_effective_admin_id();
BEGIN
  IF v_admin_id IS NULL OR v_admin_id <> _admin_id OR public.current_effective_admin_role() <> 'owner' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only the active owner session can add owners');
  END IF;
  IF _new_email IS NULL OR position('@' in _new_email) < 2 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid email');
  END IF;

  INSERT INTO public.admin_owner_whitelist (email, display_name, added_by, is_active)
  VALUES (LOWER(TRIM(_new_email)), NULLIF(TRIM(COALESCE(_display_name,'')), ''), v_admin_id, true)
  ON CONFLICT (email) DO UPDATE SET
    is_active = true,
    display_name = COALESCE(EXCLUDED.display_name, public.admin_owner_whitelist.display_name),
    updated_at = now();

  RETURN jsonb_build_object('success', true, 'email', LOWER(TRIM(_new_email)));
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_owners(_admin_id uuid)
RETURNS TABLE(email text, display_name text, is_active boolean, created_at timestamp with time zone)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_id uuid := public.current_effective_admin_id();
BEGIN
  IF v_admin_id IS NULL OR v_admin_id <> _admin_id OR public.current_effective_admin_role() <> 'owner' THEN
    RAISE EXCEPTION 'Only the active owner session can list owners';
  END IF;

  RETURN QUERY
  SELECT w.email, w.display_name, w.is_active, w.created_at
  FROM public.admin_owner_whitelist w
  ORDER BY w.created_at;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_remove_owner(_admin_id uuid, _target_email text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_id uuid := public.current_effective_admin_id();
  remaining int;
BEGIN
  IF v_admin_id IS NULL OR v_admin_id <> _admin_id OR public.current_effective_admin_role() <> 'owner' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only the active owner session can remove owners');
  END IF;
  IF _target_email IS NULL OR position('@' in _target_email) < 2 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid email');
  END IF;

  SELECT COUNT(*) INTO remaining
  FROM public.admin_owner_whitelist
  WHERE is_active = true
    AND LOWER(email) <> LOWER(TRIM(_target_email));

  IF remaining < 1 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot remove the last owner');
  END IF;

  UPDATE public.admin_owner_whitelist SET is_active = false, updated_at = now()
  WHERE LOWER(email) = LOWER(TRIM(_target_email));

  UPDATE public.admin_users SET role = 'sub_admin', updated_at = now()
  WHERE LOWER(email) = LOWER(TRIM(_target_email)) AND role = 'owner';

  RETURN jsonb_build_object('success', true);
END;
$$;

-- Keep custom admin-session RPCs callable through the anon-key PostgREST path,
-- but every high-risk function above now verifies x-admin-token/role/section server-side.
GRANT EXECUTE ON FUNCTION public.current_effective_admin_id() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.current_effective_admin_role() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_has_section_permission(text, boolean) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_has_any_section_permission(text[], boolean) TO anon, authenticated, service_role;