
-- 1. Reversal columns
ALTER TABLE public.recharge_transactions
  ADD COLUMN IF NOT EXISTS reversed_at timestamptz,
  ADD COLUMN IF NOT EXISTS reversed_by uuid,
  ADD COLUMN IF NOT EXISTS reversal_reason text;
ALTER TABLE public.agency_withdrawals
  ADD COLUMN IF NOT EXISTS reversed_at timestamptz,
  ADD COLUMN IF NOT EXISTS reversed_by uuid,
  ADD COLUMN IF NOT EXISTS reversal_reason text;
ALTER TABLE public.helper_withdrawal_requests
  ADD COLUMN IF NOT EXISTS reversed_at timestamptz,
  ADD COLUMN IF NOT EXISTS reversed_by uuid,
  ADD COLUMN IF NOT EXISTS reversal_reason text;
ALTER TABLE public.payroll_requests
  ADD COLUMN IF NOT EXISTS reversed_at timestamptz,
  ADD COLUMN IF NOT EXISTS reversed_by uuid,
  ADD COLUMN IF NOT EXISTS reversal_reason text;
ALTER TABLE public.agency_commission_history
  ADD COLUMN IF NOT EXISTS reversed_at timestamptz,
  ADD COLUMN IF NOT EXISTS reversed_by uuid,
  ADD COLUMN IF NOT EXISTS reversal_reason text;

-- 2. Unified view (admin-only via RPC; no direct grants)
DROP VIEW IF EXISTS public.auto_action_log CASCADE;
CREATE VIEW public.auto_action_log AS
SELECT 'recharge'::text AS action_type, id AS action_id,
       user_id AS subject_id, NULL::uuid AS agency_id,
       COALESCE(coins_amount,0)::bigint AS amount, 'diamonds'::text AS currency,
       status, created_at, completed_at AS processed_at, reversed_at, reversal_reason,
       payment_method AS method, COALESCE(usd_amount, amount) AS money_amount
  FROM public.recharge_transactions
UNION ALL
SELECT 'agency_withdrawal', id, NULL, agency_id,
       COALESCE(amount,0)::bigint, 'beans',
       status, requested_at, processed_at, reversed_at, reversal_reason,
       payment_method, usd_amount
  FROM public.agency_withdrawals
UNION ALL
SELECT 'helper_withdrawal', id, helper_id, NULL,
       COALESCE(beans_amount,0)::bigint, 'beans',
       status, created_at, approved_at, reversed_at, reversal_reason,
       NULL, usd_amount
  FROM public.helper_withdrawal_requests
UNION ALL
SELECT 'payroll', id, user_id, NULL,
       COALESCE(beans_amount,0)::bigint, 'beans',
       status, created_at, reviewed_at, reversed_at, reversal_reason,
       payment_method, usd_amount
  FROM public.payroll_requests
UNION ALL
SELECT 'commission', id, NULL, agency_id,
       COALESCE(commission_amount,0)::bigint, 'beans',
       'credited', created_at, created_at, reversed_at, reversal_reason,
       transaction_type, NULL
  FROM public.agency_commission_history;

-- 3. Paginated list RPC (admin-session gated)
CREATE OR REPLACE FUNCTION public.admin_list_auto_actions(
  _types text[] DEFAULT NULL,
  _status text DEFAULT NULL,
  _only_reversed boolean DEFAULT NULL,
  _from timestamptz DEFAULT NULL,
  _to timestamptz DEFAULT NULL,
  _limit int DEFAULT 100,
  _offset int DEFAULT 0
) RETURNS TABLE(
  action_type text, action_id uuid, subject_id uuid, agency_id uuid,
  amount bigint, currency text, status text,
  created_at timestamptz, processed_at timestamptz,
  reversed_at timestamptz, reversal_reason text,
  method text, money_amount numeric, total_count bigint
) LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT public.is_active_admin_session() THEN
    RAISE EXCEPTION 'Admin session required';
  END IF;
  RETURN QUERY
  WITH base AS (
    SELECT * FROM public.auto_action_log a
     WHERE (_types IS NULL OR a.action_type = ANY(_types))
       AND (_status IS NULL OR a.status = _status)
       AND (_only_reversed IS NULL
            OR (_only_reversed = true AND a.reversed_at IS NOT NULL)
            OR (_only_reversed = false AND a.reversed_at IS NULL))
       AND (_from IS NULL OR a.created_at >= _from)
       AND (_to   IS NULL OR a.created_at <= _to)
  ), counted AS ( SELECT count(*)::bigint AS c FROM base )
  SELECT b.action_type, b.action_id, b.subject_id, b.agency_id,
         b.amount, b.currency, b.status, b.created_at, b.processed_at,
         b.reversed_at, b.reversal_reason, b.method, b.money_amount,
         (SELECT c FROM counted)
    FROM base b
   ORDER BY b.created_at DESC
   LIMIT GREATEST(1, LEAST(_limit, 500))
  OFFSET GREATEST(0, _offset);
END $$;

-- 4. Reverse RPC — full refund + audit log + idempotency
CREATE OR REPLACE FUNCTION public._do_reverse_auto_action(
  _action_type text, _action_id uuid, _reason text, _admin_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_amount bigint; v_user uuid; v_agency uuid; v_helper uuid;
  v_existing timestamptz; v_diamonds_credited boolean; v_diamond_amt numeric;
BEGIN
  PERFORM set_config('app.bypass_profile_protection','true',true);

  IF _action_type = 'recharge' THEN
    SELECT reversed_at, user_id, coins_amount
      INTO v_existing, v_user, v_amount
      FROM public.recharge_transactions
     WHERE id = _action_id FOR UPDATE;
    IF v_user IS NULL THEN RETURN jsonb_build_object('success',false,'error','Recharge not found'); END IF;
    IF v_existing IS NOT NULL THEN RETURN jsonb_build_object('success',false,'error','Already reversed'); END IF;
    UPDATE public.profiles SET coins = GREATEST(0, COALESCE(coins,0) - v_amount) WHERE id = v_user;
    UPDATE public.recharge_transactions
       SET reversed_at = now(), reversed_by = _admin_id, reversal_reason = _reason,
           status = 'reversed', updated_at = now()
     WHERE id = _action_id;

  ELSIF _action_type = 'agency_withdrawal' THEN
    SELECT reversed_at, agency_id, amount
      INTO v_existing, v_agency, v_amount
      FROM public.agency_withdrawals
     WHERE id = _action_id FOR UPDATE;
    IF v_agency IS NULL THEN RETURN jsonb_build_object('success',false,'error','Withdrawal not found'); END IF;
    IF v_existing IS NOT NULL THEN RETURN jsonb_build_object('success',false,'error','Already reversed'); END IF;
    UPDATE public.agencies SET beans_balance = COALESCE(beans_balance,0) + v_amount WHERE id = v_agency;
    UPDATE public.agency_withdrawals
       SET reversed_at = now(), reversed_by = _admin_id, reversal_reason = _reason,
           status = 'reversed', updated_at = now()
     WHERE id = _action_id;

  ELSIF _action_type = 'helper_withdrawal' THEN
    SELECT reversed_at, helper_id, beans_amount, helper_diamonds_credited, diamond_reward
      INTO v_existing, v_helper, v_amount, v_diamonds_credited, v_diamond_amt
      FROM public.helper_withdrawal_requests
     WHERE id = _action_id FOR UPDATE;
    IF v_helper IS NULL THEN RETURN jsonb_build_object('success',false,'error','Helper withdrawal not found'); END IF;
    IF v_existing IS NOT NULL THEN RETURN jsonb_build_object('success',false,'error','Already reversed'); END IF;
    -- Refund beans to helper agency / profile
    UPDATE public.profiles SET beans = COALESCE(beans,0) + v_amount WHERE id = v_helper;
    -- Revert diamond reward if credited
    IF COALESCE(v_diamonds_credited,false) AND COALESCE(v_diamond_amt,0) > 0 THEN
      UPDATE public.profiles SET coins = GREATEST(0, COALESCE(coins,0) - v_diamond_amt::bigint) WHERE id = v_helper;
    END IF;
    UPDATE public.helper_withdrawal_requests
       SET reversed_at = now(), reversed_by = _admin_id, reversal_reason = _reason,
           status = 'reversed', helper_diamonds_credited = false, updated_at = now()
     WHERE id = _action_id;

  ELSIF _action_type = 'payroll' THEN
    SELECT reversed_at, user_id, beans_amount
      INTO v_existing, v_user, v_amount
      FROM public.payroll_requests
     WHERE id = _action_id FOR UPDATE;
    IF v_user IS NULL THEN RETURN jsonb_build_object('success',false,'error','Payroll not found'); END IF;
    IF v_existing IS NOT NULL THEN RETURN jsonb_build_object('success',false,'error','Already reversed'); END IF;
    UPDATE public.profiles SET beans = COALESCE(beans,0) + v_amount WHERE id = v_user;
    UPDATE public.payroll_requests
       SET reversed_at = now(), reversed_by = _admin_id, reversal_reason = _reason,
           status = 'reversed', updated_at = now()
     WHERE id = _action_id;

  ELSIF _action_type = 'commission' THEN
    SELECT reversed_at, agency_id, commission_amount
      INTO v_existing, v_agency, v_amount
      FROM public.agency_commission_history
     WHERE id = _action_id FOR UPDATE;
    IF v_agency IS NULL THEN RETURN jsonb_build_object('success',false,'error','Commission not found'); END IF;
    IF v_existing IS NOT NULL THEN RETURN jsonb_build_object('success',false,'error','Already reversed'); END IF;
    UPDATE public.agencies SET beans_balance = GREATEST(0, COALESCE(beans_balance,0) - v_amount) WHERE id = v_agency;
    UPDATE public.agency_commission_history
       SET reversed_at = now(), reversed_by = _admin_id, reversal_reason = _reason
     WHERE id = _action_id;
  ELSE
    RETURN jsonb_build_object('success',false,'error','Unknown action_type: '||_action_type);
  END IF;

  RETURN jsonb_build_object('success',true,'action_type',_action_type,'action_id',_action_id,'amount',v_amount);
END $$;

CREATE OR REPLACE FUNCTION public.admin_reverse_auto_action(
  _action_type text, _action_id uuid, _reason text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_role text; v_admin uuid; v_pending_id uuid;
BEGIN
  IF NOT public.is_active_admin_session() THEN
    RAISE EXCEPTION 'Admin session required';
  END IF;
  IF _reason IS NULL OR length(trim(_reason)) < 5 THEN
    RAISE EXCEPTION 'Reversal reason (min 5 chars) required';
  END IF;
  v_admin := public.current_admin_id_from_header();
  v_role  := public._current_admin_role();

  IF v_role = 'owner' THEN
    RETURN public._do_reverse_auto_action(_action_type, _action_id, _reason, v_admin);
  ELSE
    v_pending_id := public._enqueue_admin_pending_action(
      'reverse_auto_action', NULL, NULL,
      jsonb_build_object('action_type',_action_type,'action_id',_action_id,'reason',_reason),
      _reason);
    RETURN jsonb_build_object('pending',true,'pending_id',v_pending_id);
  END IF;
END $$;

-- 5. Extend pending-action executor to handle reverse_auto_action
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
  ELSIF _action_type = 'reverse_auto_action' THEN
    RETURN public._do_reverse_auto_action(
      _payload->>'action_type',
      (_payload->>'action_id')::uuid,
      _payload->>'reason',
      public.current_admin_id_from_header());
  END IF;
  RAISE EXCEPTION 'Unknown action_type: %', _action_type;
END $$;

GRANT EXECUTE ON FUNCTION public.admin_list_auto_actions(text[],text,boolean,timestamptz,timestamptz,int,int) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_reverse_auto_action(text,uuid,text) TO anon, authenticated;
