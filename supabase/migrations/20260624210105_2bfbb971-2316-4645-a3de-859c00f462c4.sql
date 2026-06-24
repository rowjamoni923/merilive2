
DROP FUNCTION IF EXISTS public.csa_delete_topup_method(uuid);
DROP FUNCTION IF EXISTS public.csa_delete_withdrawal_method(uuid);

-- 1. Pending actions table
CREATE TABLE IF NOT EXISTS public.csa_pending_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  csa_user_id uuid NOT NULL,
  country_code text NOT NULL,
  action_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  target_table text,
  target_id uuid,
  description text,
  status text NOT NULL DEFAULT 'pending',
  requested_at timestamptz NOT NULL DEFAULT now(),
  reviewed_by uuid,
  reviewed_at timestamptz,
  reject_reason text,
  execution_result jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.csa_pending_actions TO authenticated;
GRANT ALL ON public.csa_pending_actions TO service_role;
ALTER TABLE public.csa_pending_actions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "CSA views own pending" ON public.csa_pending_actions;
CREATE POLICY "CSA views own pending"
  ON public.csa_pending_actions FOR SELECT TO authenticated
  USING (csa_user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "Admins manage queue" ON public.csa_pending_actions;
CREATE POLICY "Admins manage queue"
  ON public.csa_pending_actions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS idx_csa_pending_status ON public.csa_pending_actions(status, requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_csa_pending_csa ON public.csa_pending_actions(csa_user_id, requested_at DESC);

DROP TRIGGER IF EXISTS trg_csa_pending_updated_at ON public.csa_pending_actions;
CREATE TRIGGER trg_csa_pending_updated_at BEFORE UPDATE ON public.csa_pending_actions
  FOR EACH ROW EXECUTE FUNCTION public.touch_csa_updated_at();

CREATE OR REPLACE FUNCTION public._csa_require_country()
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_country text;
BEGIN
  SELECT country_code INTO v_country FROM public.country_super_admins
   WHERE user_id = auth.uid() AND is_active = true;
  IF v_country IS NULL THEN RAISE EXCEPTION 'Not a Country Super Admin'; END IF;
  RETURN v_country;
END $$;

CREATE OR REPLACE FUNCTION public._csa_enqueue(
  _action_type text, _payload jsonb, _description text,
  _target_table text DEFAULT NULL, _target_id uuid DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_country text; v_id uuid;
BEGIN
  v_country := public._csa_require_country();
  INSERT INTO public.csa_pending_actions
    (csa_user_id, country_code, action_type, payload, description, target_table, target_id)
  VALUES (auth.uid(), v_country, _action_type, COALESCE(_payload,'{}'::jsonb),
          _description, _target_table, _target_id)
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.csa_upsert_topup_method(
  _id uuid, _name text, _method_type text, _payment_number text, _account_name text,
  _payment_instructions text, _icon_url text, _logo_url text,
  _is_active boolean, _is_recommended boolean, _display_order int
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_desc text;
BEGIN
  v_desc := CASE WHEN _id IS NULL THEN 'Add top-up method: ' || COALESCE(_name,'(unnamed)')
                 ELSE 'Edit top-up method: ' || COALESCE(_name,'(unnamed)') END;
  RETURN public._csa_enqueue('topup_method_upsert',
    jsonb_build_object('id', _id,'name',_name,'method_type',_method_type,
      'payment_number',_payment_number,'account_name',_account_name,
      'payment_instructions',_payment_instructions,'icon_url',_icon_url,
      'logo_url',_logo_url,'is_active',_is_active,'is_recommended',_is_recommended,
      'display_order',_display_order),
    v_desc,'topup_payment_methods',_id);
END $$;

CREATE OR REPLACE FUNCTION public.csa_delete_topup_method(_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  RETURN public._csa_enqueue('topup_method_delete',
    jsonb_build_object('id',_id),'Delete top-up method','topup_payment_methods',_id);
END $$;

CREATE OR REPLACE FUNCTION public.csa_upsert_withdrawal_method(
  _id uuid, _method_name text, _method_type text, _account_name text,
  _account_number text, _bank_name text, _instructions text,
  _logo_url text, _is_active boolean, _display_order int
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_desc text;
BEGIN
  v_desc := CASE WHEN _id IS NULL THEN 'Add withdrawal method: ' || COALESCE(_method_name,'(unnamed)')
                 ELSE 'Edit withdrawal method: ' || COALESCE(_method_name,'(unnamed)') END;
  RETURN public._csa_enqueue('withdrawal_method_upsert',
    jsonb_build_object('id',_id,'method_name',_method_name,'method_type',_method_type,
      'account_name',_account_name,'account_number',_account_number,
      'bank_name',_bank_name,'instructions',_instructions,'logo_url',_logo_url,
      'is_active',_is_active,'display_order',_display_order),
    v_desc,'helper_country_payment_methods',_id);
END $$;

CREATE OR REPLACE FUNCTION public.csa_delete_withdrawal_method(_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  RETURN public._csa_enqueue('withdrawal_method_delete',
    jsonb_build_object('id',_id),'Delete withdrawal method','helper_country_payment_methods',_id);
END $$;

CREATE OR REPLACE FUNCTION public.csa_review_helper_topup(_id uuid, _decision text, _notes text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_country text; v_req_country text;
BEGIN
  v_country := public._csa_require_country();
  SELECT upper(COALESCE(p.country_code,'')) INTO v_req_country
    FROM public.helper_topup_requests r
    LEFT JOIN public.profiles p ON p.id = r.helper_id
   WHERE r.id = _id;
  IF v_req_country IS NULL THEN RAISE EXCEPTION 'Request not found'; END IF;
  IF v_req_country <> v_country THEN RAISE EXCEPTION 'Request not in your country'; END IF;
  IF _decision NOT IN ('approve','reject') THEN RAISE EXCEPTION 'Invalid decision'; END IF;
  RETURN public._csa_enqueue('helper_topup_review',
    jsonb_build_object('request_id',_id,'decision',_decision,'notes',_notes),
    'Review helper top-up #' || substr(_id::text,1,8) || ' (' || _decision || ')',
    'helper_topup_requests',_id);
END $$;

CREATE OR REPLACE FUNCTION public.csa_review_helper_withdrawal(_id uuid, _decision text, _notes text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_country text; v_req_country text;
BEGIN
  v_country := public._csa_require_country();
  SELECT upper(COALESCE(r.country_code,'')) INTO v_req_country
    FROM public.helper_withdrawal_requests r WHERE r.id = _id;
  IF v_req_country IS NULL OR v_req_country = '' THEN
    SELECT upper(COALESCE(p.country_code,'')) INTO v_req_country
      FROM public.helper_withdrawal_requests r
      JOIN public.profiles p ON p.id = r.helper_id
     WHERE r.id = _id;
  END IF;
  IF v_req_country IS NULL THEN RAISE EXCEPTION 'Request not found'; END IF;
  IF v_req_country <> v_country THEN RAISE EXCEPTION 'Request not in your country'; END IF;
  IF _decision NOT IN ('approve','reject') THEN RAISE EXCEPTION 'Invalid decision'; END IF;
  RETURN public._csa_enqueue('helper_withdrawal_review',
    jsonb_build_object('request_id',_id,'decision',_decision,'notes',_notes),
    'Review helper withdrawal #' || substr(_id::text,1,8) || ' (' || _decision || ')',
    'helper_withdrawal_requests',_id);
END $$;

CREATE OR REPLACE FUNCTION public.csa_review_agency_withdrawal(_id uuid, _decision text, _notes text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_country text; v_req_country text;
BEGIN
  v_country := public._csa_require_country();
  SELECT upper(COALESCE(country_code,'')) INTO v_req_country
    FROM public.agency_withdrawals WHERE id = _id;
  IF v_req_country IS NULL THEN RAISE EXCEPTION 'Withdrawal not found'; END IF;
  IF v_req_country <> v_country THEN RAISE EXCEPTION 'Withdrawal not in your country'; END IF;
  IF _decision NOT IN ('approve','reject') THEN RAISE EXCEPTION 'Invalid decision'; END IF;
  RETURN public._csa_enqueue('agency_withdrawal_review',
    jsonb_build_object('withdrawal_id',_id,'decision',_decision,'notes',_notes),
    'Review agency withdrawal #' || substr(_id::text,1,8) || ' (' || _decision || ')',
    'agency_withdrawals',_id);
END $$;

CREATE OR REPLACE FUNCTION public.admin_approve_csa_action(_action_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  a public.csa_pending_actions;
  p jsonb;
  v_result jsonb := '{}'::jsonb;
  v_new_id uuid;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins can approve';
  END IF;
  SELECT * INTO a FROM public.csa_pending_actions WHERE id = _action_id AND status = 'pending' FOR UPDATE;
  IF a.id IS NULL THEN RAISE EXCEPTION 'Action not found or already processed'; END IF;
  p := a.payload;

  IF a.action_type = 'topup_method_upsert' THEN
    IF (p->>'id') IS NULL OR (p->>'id') = '' THEN
      INSERT INTO public.topup_payment_methods
        (name, method_type, payment_number, account_name, payment_instructions,
         icon_url, logo_url, is_active, is_recommended, display_order, country_codes)
      VALUES (p->>'name', p->>'method_type', p->>'payment_number', p->>'account_name',
              p->>'payment_instructions', p->>'icon_url', p->>'logo_url',
              COALESCE((p->>'is_active')::boolean,true),
              COALESCE((p->>'is_recommended')::boolean,false),
              COALESCE((p->>'display_order')::int,0),
              ARRAY[a.country_code])
      RETURNING id INTO v_new_id;
      v_result := jsonb_build_object('created_id', v_new_id);
    ELSE
      UPDATE public.topup_payment_methods SET
        name = p->>'name', method_type = p->>'method_type',
        payment_number = p->>'payment_number', account_name = p->>'account_name',
        payment_instructions = p->>'payment_instructions',
        icon_url = p->>'icon_url', logo_url = p->>'logo_url',
        is_active = COALESCE((p->>'is_active')::boolean,is_active),
        is_recommended = COALESCE((p->>'is_recommended')::boolean,is_recommended),
        display_order = COALESCE((p->>'display_order')::int,display_order),
        country_codes = ARRAY[a.country_code], updated_at = now()
       WHERE id = (p->>'id')::uuid AND country_codes @> ARRAY[a.country_code];
      v_result := jsonb_build_object('updated_id', p->>'id');
    END IF;
  ELSIF a.action_type = 'topup_method_delete' THEN
    DELETE FROM public.topup_payment_methods
     WHERE id = (p->>'id')::uuid AND country_codes @> ARRAY[a.country_code];
    v_result := jsonb_build_object('deleted_id', p->>'id');
  ELSIF a.action_type = 'withdrawal_method_upsert' THEN
    IF (p->>'id') IS NULL OR (p->>'id') = '' THEN
      INSERT INTO public.helper_country_payment_methods
        (country_code, country_name, method_name, payment_method_name, method_type,
         payment_type, account_name, account_number, bank_name, instructions,
         logo_url, icon_url, is_active, display_order)
      VALUES (a.country_code, a.country_code, p->>'method_name', p->>'method_name',
              p->>'method_type', p->>'method_type', p->>'account_name',
              p->>'account_number', p->>'bank_name', p->>'instructions',
              p->>'logo_url', p->>'logo_url',
              COALESCE((p->>'is_active')::boolean,true),
              COALESCE((p->>'display_order')::int,0))
      RETURNING id INTO v_new_id;
      v_result := jsonb_build_object('created_id', v_new_id);
    ELSE
      UPDATE public.helper_country_payment_methods SET
        method_name = p->>'method_name', payment_method_name = p->>'method_name',
        method_type = p->>'method_type', payment_type = p->>'method_type',
        account_name = p->>'account_name', account_number = p->>'account_number',
        bank_name = p->>'bank_name', instructions = p->>'instructions',
        logo_url = p->>'logo_url', icon_url = p->>'logo_url',
        is_active = COALESCE((p->>'is_active')::boolean,is_active),
        display_order = COALESCE((p->>'display_order')::int,display_order)
       WHERE id = (p->>'id')::uuid AND upper(country_code) = a.country_code;
      v_result := jsonb_build_object('updated_id', p->>'id');
    END IF;
  ELSIF a.action_type = 'withdrawal_method_delete' THEN
    DELETE FROM public.helper_country_payment_methods
     WHERE id = (p->>'id')::uuid AND upper(country_code) = a.country_code;
    v_result := jsonb_build_object('deleted_id', p->>'id');
  ELSIF a.action_type = 'helper_topup_review' THEN
    UPDATE public.helper_topup_requests
       SET country_admin_status = CASE WHEN p->>'decision' = 'approve' THEN 'approved' ELSE 'rejected' END,
           country_admin_reviewed_by = a.csa_user_id,
           country_admin_reviewed_at = now(),
           country_admin_notes = p->>'notes'
     WHERE id = (p->>'request_id')::uuid;
    v_result := jsonb_build_object('request_id', p->>'request_id', 'decision', p->>'decision');
  ELSIF a.action_type = 'helper_withdrawal_review' THEN
    UPDATE public.helper_withdrawal_requests
       SET country_admin_status = CASE WHEN p->>'decision' = 'approve' THEN 'approved' ELSE 'rejected' END,
           country_admin_reviewed_by = a.csa_user_id,
           country_admin_reviewed_at = now(),
           country_admin_notes = p->>'notes'
     WHERE id = (p->>'request_id')::uuid;
    v_result := jsonb_build_object('request_id', p->>'request_id', 'decision', p->>'decision');
  ELSIF a.action_type = 'agency_withdrawal_review' THEN
    UPDATE public.agency_withdrawals
       SET admin_notes = COALESCE(admin_notes,'') ||
           E'\n[CSA ' || a.country_code || ' ' || (p->>'decision') || ']: ' || COALESCE(p->>'notes','')
     WHERE id = (p->>'withdrawal_id')::uuid;
    v_result := jsonb_build_object('withdrawal_id', p->>'withdrawal_id', 'decision', p->>'decision');
  ELSE
    RAISE EXCEPTION 'Unknown action type: %', a.action_type;
  END IF;

  UPDATE public.csa_pending_actions
     SET status='approved', reviewed_by=auth.uid(), reviewed_at=now(),
         execution_result=v_result, updated_at=now()
   WHERE id=_action_id;

  INSERT INTO public.notifications (user_id, type, title, message, data)
  VALUES (a.csa_user_id, 'csa_action_approved', 'Action Approved',
    COALESCE(a.description,'Your action was approved by owner.'),
    jsonb_build_object('action_id', a.id, 'action_type', a.action_type));
  RETURN v_result;
END $$;

CREATE OR REPLACE FUNCTION public.admin_reject_csa_action(_action_id uuid, _reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE a public.csa_pending_actions;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins can reject';
  END IF;
  SELECT * INTO a FROM public.csa_pending_actions WHERE id = _action_id AND status = 'pending' FOR UPDATE;
  IF a.id IS NULL THEN RAISE EXCEPTION 'Action not found or already processed'; END IF;
  UPDATE public.csa_pending_actions
     SET status='rejected', reviewed_by=auth.uid(), reviewed_at=now(),
         reject_reason=_reason, updated_at=now()
   WHERE id=_action_id;
  INSERT INTO public.notifications (user_id, type, title, message, data)
  VALUES (a.csa_user_id, 'csa_action_rejected', 'Action Rejected',
    'Owner rejected: ' || COALESCE(_reason,'No reason provided'),
    jsonb_build_object('action_id', a.id, 'action_type', a.action_type));
END $$;

GRANT EXECUTE ON FUNCTION public._csa_require_country() TO authenticated;
GRANT EXECUTE ON FUNCTION public._csa_enqueue(text,jsonb,text,text,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.csa_delete_topup_method(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.csa_delete_withdrawal_method(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.csa_review_helper_topup(uuid,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.csa_review_helper_withdrawal(uuid,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.csa_review_agency_withdrawal(uuid,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_approve_csa_action(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_reject_csa_action(uuid,text) TO authenticated;
