
-- 1. Extend app_role enum
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'country_super_admin';

-- 2. Add CSA protection flag on agencies
ALTER TABLE public.agencies
  ADD COLUMN IF NOT EXISTS is_country_super_admin boolean NOT NULL DEFAULT false;

-- 3. Add recommended flag on topup payment methods
ALTER TABLE public.topup_payment_methods
  ADD COLUMN IF NOT EXISTS is_recommended boolean NOT NULL DEFAULT false;

-- 4. country_super_admins table
CREATE TABLE IF NOT EXISTS public.country_super_admins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  agency_id uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  country_code text NOT NULL,
  email text NOT NULL,
  commission_percent numeric NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  assigned_by uuid,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id),
  UNIQUE (agency_id)
);

GRANT SELECT ON public.country_super_admins TO authenticated;
GRANT ALL ON public.country_super_admins TO service_role;

ALTER TABLE public.country_super_admins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "CSA can view own row"
  ON public.country_super_admins FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins manage CSA"
  ON public.country_super_admins FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS idx_csa_country ON public.country_super_admins(country_code) WHERE is_active;
CREATE INDEX IF NOT EXISTS idx_csa_user ON public.country_super_admins(user_id);

-- 5. Updated-at trigger
CREATE OR REPLACE FUNCTION public.touch_csa_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_csa_updated_at ON public.country_super_admins;
CREATE TRIGGER trg_csa_updated_at BEFORE UPDATE ON public.country_super_admins
  FOR EACH ROW EXECUTE FUNCTION public.touch_csa_updated_at();

-- 6. Protect CSA agencies in auto-close
CREATE OR REPLACE FUNCTION public.auto_close_overdue_agencies()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r RECORD;
  v_count integer := 0;
  v_reason text := 'Your agency was automatically closed because fewer than 10 hosts were activated within the 30-day activation window.';
BEGIN
  FOR r IN
    SELECT id, owner_id, name
      FROM public.agencies
     WHERE activation_status = 'pending'
       AND COALESCE(is_official, false) = false
       AND COALESCE(is_country_super_admin, false) = false
       AND activation_deadline IS NOT NULL
       AND activation_deadline < now()
       AND active_host_count < 10
  LOOP
    UPDATE public.agencies
       SET activation_status = 'closed',
           is_active = false,
           is_blocked = true,
           blocked_at = COALESCE(blocked_at, now()),
           blocked_reason = COALESCE(blocked_reason, v_reason),
           closed_at = COALESCE(closed_at, now()),
           closed_reason = COALESCE(closed_reason, v_reason),
           updated_at = now()
     WHERE id = r.id;

    UPDATE public.agency_hosts
       SET status = 'left', left_at = COALESCE(left_at, now())
     WHERE agency_id = r.id AND left_at IS NULL;

    UPDATE public.profiles SET agency_id = NULL WHERE agency_id = r.id;

    IF r.owner_id IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, type, title, message, data)
      VALUES (r.owner_id, 'agency_closed', 'Agency Closed', v_reason,
        jsonb_build_object('agency_id', r.id, 'agency_name', r.name, 'reason_code', 'host_activation_timeout'));
    END IF;
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$function$;

-- 7. Protect CSA agencies in recalc
CREATE OR REPLACE FUNCTION public.recalc_agency_activation(p_agency_id uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_count integer; v_status text; v_protected boolean;
BEGIN
  SELECT COUNT(*) INTO v_count FROM public.agency_hosts
   WHERE agency_id = p_agency_id AND status = 'active' AND left_at IS NULL;

  SELECT activation_status, (COALESCE(is_official,false) OR COALESCE(is_country_super_admin,false))
    INTO v_status, v_protected
  FROM public.agencies WHERE id = p_agency_id FOR UPDATE;

  IF v_status IS NULL THEN RETURN; END IF;

  IF v_protected THEN
    UPDATE public.agencies
       SET active_host_count = v_count, activation_status = 'active',
           is_active = true, is_blocked = false, updated_at = now()
     WHERE id = p_agency_id;
    RETURN;
  END IF;

  IF v_status <> 'closed' AND v_count >= 10 THEN
    UPDATE public.agencies
       SET active_host_count = v_count, activation_status = 'active', updated_at = now()
     WHERE id = p_agency_id;
  ELSE
    UPDATE public.agencies SET active_host_count = v_count, updated_at = now()
     WHERE id = p_agency_id;
  END IF;
END;
$function$;

-- 8. Admin: grant CSA power
CREATE OR REPLACE FUNCTION public.admin_grant_country_super_admin(
  _agency_id uuid,
  _user_id uuid,
  _email text,
  _country_code text,
  _commission_percent numeric DEFAULT 0
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_row public.country_super_admins;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins can grant Country Super Admin';
  END IF;
  IF _country_code IS NULL OR length(_country_code) < 2 THEN
    RAISE EXCEPTION 'Country code is required';
  END IF;

  INSERT INTO public.country_super_admins (user_id, agency_id, country_code, email, commission_percent, is_active, assigned_by)
  VALUES (_user_id, _agency_id, upper(_country_code), lower(_email), COALESCE(_commission_percent,0), true, auth.uid())
  ON CONFLICT (user_id) DO UPDATE SET
    agency_id = EXCLUDED.agency_id,
    country_code = EXCLUDED.country_code,
    email = EXCLUDED.email,
    commission_percent = EXCLUDED.commission_percent,
    is_active = true,
    revoked_at = NULL,
    updated_at = now()
  RETURNING * INTO v_row;

  -- Ensure role
  INSERT INTO public.user_roles (user_id, role)
  VALUES (_user_id, 'country_super_admin')
  ON CONFLICT (user_id, role) DO NOTHING;

  -- Protect agency
  UPDATE public.agencies
     SET is_country_super_admin = true,
         activation_status = CASE WHEN activation_status = 'closed' THEN 'active' ELSE activation_status END,
         is_active = true,
         is_blocked = false,
         blocked_reason = NULL,
         closed_at = NULL,
         closed_reason = NULL,
         updated_at = now()
   WHERE id = _agency_id;

  INSERT INTO public.notifications (user_id, type, title, message, data)
  VALUES (_user_id, 'csa_granted', 'Country Super Admin Granted',
    'You have been granted Country Super Admin power for ' || upper(_country_code) || '. Log in at /csa-login with your email and password.',
    jsonb_build_object('country_code', upper(_country_code), 'agency_id', _agency_id));

  RETURN to_jsonb(v_row);
END $$;

-- 9. Admin: revoke
CREATE OR REPLACE FUNCTION public.admin_revoke_country_super_admin(_agency_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_user uuid;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins can revoke';
  END IF;
  SELECT user_id INTO v_user FROM public.country_super_admins WHERE agency_id = _agency_id;
  UPDATE public.country_super_admins
     SET is_active = false, revoked_at = now(), updated_at = now()
   WHERE agency_id = _agency_id;
  UPDATE public.agencies SET is_country_super_admin = false, updated_at = now() WHERE id = _agency_id;
  IF v_user IS NOT NULL THEN
    DELETE FROM public.user_roles WHERE user_id = v_user AND role = 'country_super_admin';
  END IF;
END $$;

-- 10. CSA: get own context
CREATE OR REPLACE FUNCTION public.csa_get_my_context()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' STABLE AS $$
DECLARE v jsonb;
BEGIN
  SELECT to_jsonb(csa) || jsonb_build_object('agency_name', a.name)
    INTO v
    FROM public.country_super_admins csa
    LEFT JOIN public.agencies a ON a.id = csa.agency_id
   WHERE csa.user_id = auth.uid() AND csa.is_active = true;
  RETURN v;
END $$;

-- 11. CSA: country KPIs
CREATE OR REPLACE FUNCTION public.csa_country_kpis()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' STABLE AS $$
DECLARE
  v_country text;
  v_deposit numeric := 0;
  v_withdraw numeric := 0;
  v_pending_topups int := 0;
  v_pending_wd int := 0;
  v_active_topup int := 0;
  v_active_wd int := 0;
BEGIN
  SELECT country_code INTO v_country FROM public.country_super_admins
   WHERE user_id = auth.uid() AND is_active = true;
  IF v_country IS NULL THEN RAISE EXCEPTION 'Not a CSA'; END IF;

  SELECT COALESCE(SUM(amount_usd),0) INTO v_deposit
    FROM public.recharge_transactions
   WHERE status = 'completed'
     AND created_at >= date_trunc('month', now())
     AND upper(COALESCE(country_code,'')) = v_country;

  SELECT COALESCE(SUM(amount_usd),0) INTO v_withdraw
    FROM public.agency_withdrawals
   WHERE status = 'paid'
     AND created_at >= date_trunc('month', now())
     AND upper(COALESCE(country_code,'')) = v_country;

  SELECT COUNT(*) INTO v_pending_topups FROM public.recharge_transactions
   WHERE status = 'pending' AND upper(COALESCE(country_code,'')) = v_country;

  SELECT COUNT(*) INTO v_pending_wd FROM public.agency_withdrawals
   WHERE status = 'pending' AND upper(COALESCE(country_code,'')) = v_country;

  SELECT COUNT(*) INTO v_active_topup FROM public.topup_payment_methods
   WHERE is_active = true AND country_codes @> ARRAY[v_country];

  SELECT COUNT(*) INTO v_active_wd FROM public.helper_country_payment_methods
   WHERE is_active = true AND upper(country_code) = v_country;

  RETURN jsonb_build_object(
    'country_code', v_country,
    'month_deposit_usd', v_deposit,
    'month_withdraw_usd', v_withdraw,
    'pending_topups', v_pending_topups,
    'pending_withdrawals', v_pending_wd,
    'active_topup_methods', v_active_topup,
    'active_withdrawal_methods', v_active_wd
  );
END $$;

-- 12. CSA: upsert topup method (country forced to CSA's country)
CREATE OR REPLACE FUNCTION public.csa_upsert_topup_method(
  _id uuid,
  _name text,
  _method_type text,
  _payment_number text,
  _account_name text,
  _payment_instructions text,
  _icon_url text,
  _logo_url text,
  _is_active boolean,
  _is_recommended boolean,
  _display_order int
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_country text; v_id uuid; v_existing_country text[];
BEGIN
  SELECT country_code INTO v_country FROM public.country_super_admins
   WHERE user_id = auth.uid() AND is_active = true;
  IF v_country IS NULL THEN RAISE EXCEPTION 'Not a CSA'; END IF;

  IF _id IS NULL THEN
    INSERT INTO public.topup_payment_methods
      (name, method_type, payment_number, account_name, payment_instructions,
       icon_url, logo_url, is_active, is_recommended, display_order, country_codes)
    VALUES (_name, _method_type, _payment_number, _account_name, _payment_instructions,
       _icon_url, _logo_url, COALESCE(_is_active,true), COALESCE(_is_recommended,false),
       COALESCE(_display_order,0), ARRAY[v_country])
    RETURNING id INTO v_id;
  ELSE
    SELECT country_codes INTO v_existing_country FROM public.topup_payment_methods WHERE id = _id;
    IF v_existing_country IS NULL OR NOT (v_existing_country @> ARRAY[v_country]) THEN
      RAISE EXCEPTION 'Method not in your country';
    END IF;
    UPDATE public.topup_payment_methods SET
      name = _name, method_type = _method_type, payment_number = _payment_number,
      account_name = _account_name, payment_instructions = _payment_instructions,
      icon_url = _icon_url, logo_url = _logo_url, is_active = _is_active,
      is_recommended = _is_recommended, display_order = _display_order,
      country_codes = ARRAY[v_country], updated_at = now()
     WHERE id = _id
     RETURNING id INTO v_id;
  END IF;
  RETURN v_id;
END $$;

-- 13. CSA: upsert withdrawal method
CREATE OR REPLACE FUNCTION public.csa_upsert_withdrawal_method(
  _id uuid,
  _method_name text,
  _method_type text,
  _account_name text,
  _account_number text,
  _bank_name text,
  _instructions text,
  _logo_url text,
  _is_active boolean,
  _display_order int
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_country text; v_id uuid; v_existing text;
BEGIN
  SELECT country_code INTO v_country FROM public.country_super_admins
   WHERE user_id = auth.uid() AND is_active = true;
  IF v_country IS NULL THEN RAISE EXCEPTION 'Not a CSA'; END IF;

  IF _id IS NULL THEN
    INSERT INTO public.helper_country_payment_methods
      (country_code, country_name, method_name, payment_method_name, method_type, payment_type,
       account_name, account_number, bank_name, instructions, logo_url, icon_url,
       is_active, display_order)
    VALUES (v_country, v_country, _method_name, _method_name, _method_type, _method_type,
       _account_name, _account_number, _bank_name, _instructions, _logo_url, _logo_url,
       COALESCE(_is_active,true), COALESCE(_display_order,0))
    RETURNING id INTO v_id;
  ELSE
    SELECT upper(country_code) INTO v_existing FROM public.helper_country_payment_methods WHERE id = _id;
    IF v_existing IS NULL OR v_existing <> v_country THEN
      RAISE EXCEPTION 'Method not in your country';
    END IF;
    UPDATE public.helper_country_payment_methods SET
      method_name = _method_name, payment_method_name = _method_name,
      method_type = _method_type, payment_type = _method_type,
      account_name = _account_name, account_number = _account_number,
      bank_name = _bank_name, instructions = _instructions,
      logo_url = _logo_url, icon_url = _logo_url,
      is_active = _is_active, display_order = _display_order
     WHERE id = _id
     RETURNING id INTO v_id;
  END IF;
  RETURN v_id;
END $$;

-- 14. CSA: delete methods (country-scoped)
CREATE OR REPLACE FUNCTION public.csa_delete_topup_method(_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_country text;
BEGIN
  SELECT country_code INTO v_country FROM public.country_super_admins
   WHERE user_id = auth.uid() AND is_active = true;
  IF v_country IS NULL THEN RAISE EXCEPTION 'Not a CSA'; END IF;
  DELETE FROM public.topup_payment_methods
   WHERE id = _id AND country_codes @> ARRAY[v_country];
END $$;

CREATE OR REPLACE FUNCTION public.csa_delete_withdrawal_method(_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_country text;
BEGIN
  SELECT country_code INTO v_country FROM public.country_super_admins
   WHERE user_id = auth.uid() AND is_active = true;
  IF v_country IS NULL THEN RAISE EXCEPTION 'Not a CSA'; END IF;
  DELETE FROM public.helper_country_payment_methods
   WHERE id = _id AND upper(country_code) = v_country;
END $$;

GRANT EXECUTE ON FUNCTION public.admin_grant_country_super_admin(uuid,uuid,text,text,numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_revoke_country_super_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.csa_get_my_context() TO authenticated;
GRANT EXECUTE ON FUNCTION public.csa_country_kpis() TO authenticated;
GRANT EXECUTE ON FUNCTION public.csa_upsert_topup_method(uuid,text,text,text,text,text,text,text,boolean,boolean,int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.csa_upsert_withdrawal_method(uuid,text,text,text,text,text,text,text,boolean,int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.csa_delete_topup_method(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.csa_delete_withdrawal_method(uuid) TO authenticated;
