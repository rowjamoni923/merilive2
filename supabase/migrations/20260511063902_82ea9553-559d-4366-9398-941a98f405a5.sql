
DROP FUNCTION IF EXISTS public.add_diamonds_to_user(uuid, integer);
DROP FUNCTION IF EXISTS public.add_beans_to_user(uuid, integer);

CREATE TABLE IF NOT EXISTS public.admin_pending_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action_type text NOT NULL,
  target_user_id uuid,
  target_agency_id uuid,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  reason text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','cancelled')),
  requested_by uuid NOT NULL,
  requested_by_name text,
  reviewed_by uuid,
  reviewed_by_name text,
  reviewed_at timestamptz,
  owner_notes text,
  executed_result jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_admin_pending_actions_status ON public.admin_pending_actions(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_pending_actions_requested_by ON public.admin_pending_actions(requested_by, created_at DESC);
ALTER TABLE public.admin_pending_actions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin session full access" ON public.admin_pending_actions;
CREATE POLICY "Admin session full access" ON public.admin_pending_actions
  FOR ALL USING (public.is_active_admin_session()) WITH CHECK (public.is_active_admin_session());

CREATE OR REPLACE FUNCTION public._current_admin_role()
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE v_role text;
BEGIN
  SELECT role::text INTO v_role FROM public.admin_users WHERE id = public.current_admin_id_from_header() AND is_active = true;
  RETURN v_role;
END $$;

CREATE OR REPLACE FUNCTION public._current_admin_display()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT COALESCE(support_display_name, display_name, email) FROM public.admin_users WHERE id = public.current_admin_id_from_header();
$$;

CREATE OR REPLACE FUNCTION public._execute_admin_pending_action(_action_type text, _payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_user uuid; v_amount integer; v_agency uuid; v_delta bigint; v_gender text;
  v_submission uuid; v_action text; v_reason text; v_set_gender text;
BEGIN
  IF _action_type = 'add_diamonds' THEN
    v_user := (_payload->>'user_id')::uuid; v_amount := (_payload->>'amount')::int;
    PERFORM set_config('app.bypass_profile_protection','true',true);
    UPDATE profiles SET coins = COALESCE(coins,0) + v_amount WHERE id = v_user;
    RETURN jsonb_build_object('success',true);
  ELSIF _action_type = 'add_beans' THEN
    v_user := (_payload->>'user_id')::uuid; v_amount := (_payload->>'amount')::int;
    UPDATE profiles SET beans = COALESCE(beans,0) + v_amount WHERE id = v_user;
    RETURN jsonb_build_object('success',true);
  ELSIF _action_type = 'agency_beans_adjust' THEN
    v_agency := (_payload->>'agency_id')::uuid; v_delta := (_payload->>'delta')::bigint;
    UPDATE agencies SET beans_balance = COALESCE(beans_balance,0) + v_delta WHERE id = v_agency;
    RETURN jsonb_build_object('success',true);
  ELSIF _action_type = 'update_gender' THEN
    v_user := (_payload->>'user_id')::uuid; v_gender := _payload->>'gender';
    IF v_gender NOT IN ('female','male') THEN RETURN jsonb_build_object('success',false,'error','Invalid gender'); END IF;
    UPDATE profiles SET gender = v_gender,
       is_host = CASE WHEN v_gender='female' THEN true ELSE false END,
       host_status = CASE WHEN v_gender='female' AND COALESCE(is_face_verified,false) THEN 'approved'
                          WHEN v_gender='female' THEN 'pending_face' ELSE NULL END,
       updated_at = now() WHERE id = v_user;
    RETURN jsonb_build_object('success',true);
  ELSIF _action_type = 'process_face_verification' THEN
    v_submission := (_payload->>'submission_id')::uuid;
    v_action := _payload->>'action'; v_reason := _payload->>'reason'; v_set_gender := _payload->>'set_gender';
    SELECT user_id INTO v_user FROM face_verification_submissions WHERE id = v_submission;
    IF v_user IS NULL THEN RETURN jsonb_build_object('success',false,'error','Submission not found'); END IF;
    UPDATE face_verification_submissions
       SET status = CASE WHEN v_action='approve' THEN 'approved' ELSE 'rejected' END,
           reviewed_by = current_admin_id_from_header(), reviewed_at = now(),
           admin_notes = COALESCE(v_reason, admin_notes),
           rejection_reason = CASE WHEN v_action='reject' THEN v_reason ELSE rejection_reason END
     WHERE id = v_submission;
    IF v_action='approve' THEN
      v_gender := lower(trim(COALESCE(NULLIF(trim(COALESCE(v_set_gender,'')),''),
                  (SELECT lower(trim(COALESCE(p.gender,''))) FROM profiles p WHERE p.id = v_user),'male')));
      IF v_gender NOT IN ('female','male') THEN v_gender := 'male'; END IF;
      UPDATE face_verification_submissions
         SET verification_type = CASE WHEN v_gender='female' THEN 'host' ELSE 'user' END, updated_at = now()
       WHERE id = v_submission;
      UPDATE profiles SET is_face_verified=true, face_verified_at=now(), face_verification_status='approved',
                          gender=v_gender, is_host=(v_gender='female'),
                          host_status = CASE WHEN v_gender='female' THEN 'approved' ELSE NULL END,
                          updated_at=now() WHERE id = v_user;
    ELSE
      UPDATE profiles SET is_face_verified=false, face_verification_status='rejected',
                          host_status = CASE WHEN is_host THEN 'rejected' ELSE host_status END,
                          updated_at=now() WHERE id = v_user;
    END IF;
    RETURN jsonb_build_object('success',true);
  ELSIF _action_type = 'remove_face_verification' THEN
    v_user := (_payload->>'user_id')::uuid;
    UPDATE face_verification_submissions
       SET status='rejected', reviewed_by=current_admin_id_from_header(), reviewed_at=now(),
           admin_notes = COALESCE(admin_notes,'') || E'\n[Revoked by admin]'
     WHERE user_id = v_user AND status IN ('approved','under_review');
    UPDATE profiles SET is_face_verified=false, face_verification_status='pending_face',
                        host_status = CASE WHEN is_host THEN 'pending_face' ELSE host_status END,
                        updated_at=now() WHERE id = v_user;
    RETURN jsonb_build_object('success',true);
  END IF;
  RAISE EXCEPTION 'Unknown action_type: %', _action_type;
END $$;

CREATE OR REPLACE FUNCTION public._enqueue_admin_pending_action(
  _action_type text, _target_user uuid, _target_agency uuid, _payload jsonb, _reason text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_id uuid; v_admin uuid := public.current_admin_id_from_header();
        v_name text := public._current_admin_display(); v_owner record; v_label text;
BEGIN
  INSERT INTO admin_pending_actions(action_type, target_user_id, target_agency_id, payload, reason, requested_by, requested_by_name)
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
  FOR v_owner IN SELECT user_id FROM admin_users WHERE role='owner' AND is_active=true AND user_id IS NOT NULL LOOP
    BEGIN
      INSERT INTO notifications(user_id, type, title, body, data)
      VALUES (v_owner.user_id, 'admin_pending_action',
              'Pending approval: ' || v_label,
              COALESCE(v_name,'Sub-admin') || ' requested: ' || v_label,
              jsonb_build_object('pending_id', v_id, 'action_type', _action_type, 'requested_by_name', v_name));
    EXCEPTION WHEN others THEN NULL; END;
  END LOOP;
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.add_diamonds_to_user(_user_id uuid, _amount integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_role text; v_pending uuid;
BEGIN
  IF NOT public.is_admin(auth.uid()) AND NOT public.is_active_admin_session() THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  v_role := public._current_admin_role();
  IF v_role = 'sub_admin' THEN
    v_pending := public._enqueue_admin_pending_action('add_diamonds', _user_id, NULL,
      jsonb_build_object('user_id',_user_id,'amount',_amount), NULL);
    RETURN jsonb_build_object('pending', true, 'request_id', v_pending);
  END IF;
  PERFORM set_config('app.bypass_profile_protection','true',true);
  UPDATE profiles SET coins = COALESCE(coins,0) + _amount WHERE id = _user_id;
  RETURN jsonb_build_object('success', true);
END $$;

CREATE OR REPLACE FUNCTION public.add_beans_to_user(_user_id uuid, _amount integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_role text; v_pending uuid;
BEGIN
  IF NOT public.is_admin(auth.uid()) AND NOT public.is_active_admin_session() THEN RAISE EXCEPTION 'Unauthorized: Only admins can add beans'; END IF;
  v_role := public._current_admin_role();
  IF v_role = 'sub_admin' THEN
    v_pending := public._enqueue_admin_pending_action('add_beans', _user_id, NULL,
      jsonb_build_object('user_id',_user_id,'amount',_amount), NULL);
    RETURN jsonb_build_object('pending', true, 'request_id', v_pending);
  END IF;
  UPDATE profiles SET beans = COALESCE(beans,0) + _amount WHERE id = _user_id;
  RETURN jsonb_build_object('success', true);
END $$;

CREATE OR REPLACE FUNCTION public.admin_update_user_gender(_user_id uuid, _gender text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_role text; v_pending uuid;
BEGIN
  IF NOT is_active_admin_session() THEN RETURN jsonb_build_object('success',false,'error','Not authorized'); END IF;
  IF _gender NOT IN ('female','male') THEN RETURN jsonb_build_object('success',false,'error','Invalid gender'); END IF;
  v_role := public._current_admin_role();
  IF v_role = 'sub_admin' THEN
    v_pending := public._enqueue_admin_pending_action('update_gender', _user_id, NULL,
      jsonb_build_object('user_id',_user_id,'gender',_gender), NULL);
    RETURN jsonb_build_object('pending', true, 'request_id', v_pending);
  END IF;
  RETURN public._execute_admin_pending_action('update_gender', jsonb_build_object('user_id',_user_id,'gender',_gender));
END $$;

CREATE OR REPLACE FUNCTION public.admin_process_face_verification(_submission_id uuid, _action text, _reason text DEFAULT NULL, _approve_as text DEFAULT 'host', _set_gender text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_role text; v_pending uuid; v_user uuid;
BEGIN
  IF NOT is_active_admin_session() THEN RETURN jsonb_build_object('success',false,'error','Not authorized'); END IF;
  SELECT user_id INTO v_user FROM face_verification_submissions WHERE id = _submission_id;
  IF v_user IS NULL THEN RETURN jsonb_build_object('success',false,'error','Submission not found'); END IF;
  v_role := public._current_admin_role();
  IF v_role = 'sub_admin' THEN
    v_pending := public._enqueue_admin_pending_action('process_face_verification', v_user, NULL,
      jsonb_build_object('submission_id',_submission_id,'action',_action,'reason',_reason,'set_gender',_set_gender), _reason);
    RETURN jsonb_build_object('pending', true, 'request_id', v_pending);
  END IF;
  RETURN public._execute_admin_pending_action('process_face_verification',
    jsonb_build_object('submission_id',_submission_id,'action',_action,'reason',_reason,'set_gender',_set_gender));
END $$;

CREATE OR REPLACE FUNCTION public.admin_remove_face_verification(_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_role text; v_pending uuid;
BEGIN
  IF NOT is_active_admin_session() THEN RETURN jsonb_build_object('success',false,'error','Not authorized'); END IF;
  v_role := public._current_admin_role();
  IF v_role = 'sub_admin' THEN
    v_pending := public._enqueue_admin_pending_action('remove_face_verification', _user_id, NULL,
      jsonb_build_object('user_id',_user_id), NULL);
    RETURN jsonb_build_object('pending', true, 'request_id', v_pending);
  END IF;
  RETURN public._execute_admin_pending_action('remove_face_verification', jsonb_build_object('user_id',_user_id));
END $$;

CREATE OR REPLACE FUNCTION public.admin_adjust_agency_beans(_agency_id uuid, _delta bigint, _reason text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_role text; v_pending uuid;
BEGIN
  IF NOT is_active_admin_session() THEN RETURN jsonb_build_object('success',false,'error','Not authorized'); END IF;
  v_role := public._current_admin_role();
  IF v_role = 'sub_admin' THEN
    v_pending := public._enqueue_admin_pending_action('agency_beans_adjust', NULL, _agency_id,
      jsonb_build_object('agency_id',_agency_id,'delta',_delta), _reason);
    RETURN jsonb_build_object('pending', true, 'request_id', v_pending);
  END IF;
  RETURN public._execute_admin_pending_action('agency_beans_adjust',
    jsonb_build_object('agency_id',_agency_id,'delta',_delta));
END $$;

CREATE OR REPLACE FUNCTION public.admin_approve_pending_action(_id uuid, _notes text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_role text; r record; v_result jsonb;
BEGIN
  IF NOT is_active_admin_session() THEN RETURN jsonb_build_object('success',false,'error','Not authorized'); END IF;
  v_role := public._current_admin_role();
  IF v_role <> 'owner' THEN RETURN jsonb_build_object('success',false,'error','Only owner can approve'); END IF;
  SELECT * INTO r FROM admin_pending_actions WHERE id = _id FOR UPDATE;
  IF r IS NULL THEN RETURN jsonb_build_object('success',false,'error','Not found'); END IF;
  IF r.status <> 'pending' THEN RETURN jsonb_build_object('success',false,'error','Already '||r.status); END IF;
  v_result := public._execute_admin_pending_action(r.action_type, r.payload);
  UPDATE admin_pending_actions
     SET status='approved', reviewed_by=public.current_admin_id_from_header(),
         reviewed_by_name=public._current_admin_display(), reviewed_at=now(),
         owner_notes=_notes, executed_result=v_result, updated_at=now()
   WHERE id=_id;
  RETURN jsonb_build_object('success', true, 'result', v_result);
END $$;

CREATE OR REPLACE FUNCTION public.admin_reject_pending_action(_id uuid, _notes text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_role text;
BEGIN
  IF NOT is_active_admin_session() THEN RETURN jsonb_build_object('success',false,'error','Not authorized'); END IF;
  v_role := public._current_admin_role();
  IF v_role <> 'owner' THEN RETURN jsonb_build_object('success',false,'error','Only owner can reject'); END IF;
  UPDATE admin_pending_actions
     SET status='rejected', reviewed_by=public.current_admin_id_from_header(),
         reviewed_by_name=public._current_admin_display(), reviewed_at=now(),
         owner_notes=_notes, updated_at=now()
   WHERE id=_id AND status='pending';
  IF NOT FOUND THEN RETURN jsonb_build_object('success',false,'error','Not found or already reviewed'); END IF;
  RETURN jsonb_build_object('success', true);
END $$;

CREATE OR REPLACE FUNCTION public.admin_list_pending_actions(_status text DEFAULT 'pending', _limit int DEFAULT 200)
RETURNS SETOF admin_pending_actions LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path=public AS $$
DECLARE v_role text;
BEGIN
  IF NOT is_active_admin_session() THEN RETURN; END IF;
  v_role := public._current_admin_role();
  IF v_role = 'owner' THEN
    RETURN QUERY SELECT * FROM admin_pending_actions
      WHERE (_status IS NULL OR _status='all' OR status=_status)
      ORDER BY created_at DESC LIMIT _limit;
  ELSE
    RETURN QUERY SELECT * FROM admin_pending_actions
      WHERE requested_by = public.current_admin_id_from_header()
        AND (_status IS NULL OR _status='all' OR status=_status)
      ORDER BY created_at DESC LIMIT _limit;
  END IF;
END $$;
