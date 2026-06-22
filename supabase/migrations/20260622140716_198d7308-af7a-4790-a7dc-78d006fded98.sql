
-- ============================================================
-- SUPER ADMIN MANAGEMENT (Country Payroll Manager) — Foundation
-- ============================================================

-- 1) Global settings (single row, owner-managed)
CREATE TABLE public.country_super_admin_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  min_deposit_usd numeric NOT NULL DEFAULT 10000,
  default_commission_percent numeric NOT NULL DEFAULT 25 CHECK (default_commission_percent >= 0 AND default_commission_percent <= 25),
  max_commission_percent numeric NOT NULL DEFAULT 25 CHECK (max_commission_percent >= 0 AND max_commission_percent <= 25),
  require_signed_contract boolean NOT NULL DEFAULT true,
  require_official_contact boolean NOT NULL DEFAULT true,
  is_program_open boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.country_super_admin_settings TO authenticated;
GRANT ALL ON public.country_super_admin_settings TO service_role;
ALTER TABLE public.country_super_admin_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "settings readable authed" ON public.country_super_admin_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "settings admin write" ON public.country_super_admin_settings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.country_super_admin_settings (id) VALUES (gen_random_uuid());

-- 2) Applications table
CREATE TABLE public.country_super_admin_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  applicant_user_id uuid NOT NULL,
  country_code text NOT NULL,
  full_name text NOT NULL,
  business_name text,
  official_email text NOT NULL,
  official_phone text NOT NULL,
  whatsapp text,
  telegram text,
  national_id_url text,
  business_doc_url text,
  signed_contract_url text,
  deposit_amount_usd numeric NOT NULL DEFAULT 0,
  deposit_proof_url text,
  deposit_tx_ref text,
  requested_commission_percent numeric NOT NULL DEFAULT 25 CHECK (requested_commission_percent >= 0 AND requested_commission_percent <= 25),
  notes text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','under_review','approved','rejected','withdrawn')),
  reviewer_id uuid,
  reviewer_notes text,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_csa_apps_status ON public.country_super_admin_applications(status);
CREATE INDEX idx_csa_apps_country ON public.country_super_admin_applications(country_code);
CREATE INDEX idx_csa_apps_user ON public.country_super_admin_applications(applicant_user_id);
GRANT SELECT, INSERT, UPDATE ON public.country_super_admin_applications TO authenticated;
GRANT ALL ON public.country_super_admin_applications TO service_role;
ALTER TABLE public.country_super_admin_applications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "apps owner read" ON public.country_super_admin_applications FOR SELECT TO authenticated
  USING (applicant_user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "apps owner insert" ON public.country_super_admin_applications FOR INSERT TO authenticated
  WITH CHECK (applicant_user_id = auth.uid() AND status = 'pending');
CREATE POLICY "apps owner update pending" ON public.country_super_admin_applications FOR UPDATE TO authenticated
  USING ((applicant_user_id = auth.uid() AND status = 'pending') OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK ((applicant_user_id = auth.uid() AND status IN ('pending','withdrawn')) OR public.has_role(auth.uid(), 'admin'));

-- 3) Active assignments (one active per country)
CREATE TABLE public.country_payroll_admins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  country_code text NOT NULL,
  application_id uuid REFERENCES public.country_super_admin_applications(id),
  allowed_payment_methods jsonb NOT NULL DEFAULT '[]'::jsonb,
  auto_pay_enabled boolean NOT NULL DEFAULT false,
  min_withdraw_usd numeric NOT NULL DEFAULT 0,
  max_withdraw_usd numeric NOT NULL DEFAULT 0,
  daily_cap_usd numeric NOT NULL DEFAULT 0,
  commission_percent numeric NOT NULL DEFAULT 25 CHECK (commission_percent >= 0 AND commission_percent <= 25),
  deposit_amount_usd numeric NOT NULL DEFAULT 0,
  deposit_locked boolean NOT NULL DEFAULT true,
  contract_url text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','revoked')),
  assigned_by uuid,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  suspended_reason text,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uniq_country_payroll_admin_active
  ON public.country_payroll_admins(country_code) WHERE status = 'active';
CREATE INDEX idx_cpa_user ON public.country_payroll_admins(user_id);
GRANT SELECT ON public.country_payroll_admins TO authenticated;
GRANT ALL ON public.country_payroll_admins TO service_role;
ALTER TABLE public.country_payroll_admins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cpa self read" ON public.country_payroll_admins FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "cpa admin write" ON public.country_payroll_admins FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 4) Security-definer helpers
CREATE OR REPLACE FUNCTION public.is_country_payroll_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.country_payroll_admins
                 WHERE user_id = _user_id AND status = 'active')
$$;

CREATE OR REPLACE FUNCTION public.get_user_payroll_country(_user_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT country_code FROM public.country_payroll_admins
  WHERE user_id = _user_id AND status = 'active' LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.is_country_payroll_admin_for(_user_id uuid, _country_code text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.country_payroll_admins
                 WHERE user_id = _user_id AND status = 'active' AND country_code = _country_code)
$$;

CREATE OR REPLACE FUNCTION public.get_active_country_payroll_config(_country_code text)
RETURNS public.country_payroll_admins LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT * FROM public.country_payroll_admins
  WHERE country_code = _country_code AND status = 'active' LIMIT 1
$$;

-- Country-scoped self-update policy (only own country, only allowed config fields)
CREATE POLICY "cpa self config update" ON public.country_payroll_admins FOR UPDATE TO authenticated
  USING (user_id = auth.uid() AND status = 'active')
  WITH CHECK (
    user_id = auth.uid()
    AND status = 'active'
    AND commission_percent <= 25
    AND commission_percent >= 0
  );

-- 5) Commission ledger (immutable, append-only)
CREATE TABLE public.country_payroll_admin_commissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payroll_admin_id uuid NOT NULL REFERENCES public.country_payroll_admins(id),
  country_code text NOT NULL,
  withdrawal_request_id uuid NOT NULL,
  withdrawal_source text NOT NULL CHECK (withdrawal_source IN ('helper_withdrawal','agency_withdrawal','direct')),
  withdrawal_amount_usd numeric NOT NULL,
  commission_percent numeric NOT NULL,
  commission_amount_usd numeric NOT NULL,
  status text NOT NULL DEFAULT 'credited' CHECK (status IN ('credited','reversed','disputed')),
  reversal_reason text,
  reversed_at timestamptz,
  reversed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uniq_cpac_withdrawal
  ON public.country_payroll_admin_commissions(withdrawal_source, withdrawal_request_id)
  WHERE status = 'credited';
CREATE INDEX idx_cpac_admin ON public.country_payroll_admin_commissions(payroll_admin_id);
CREATE INDEX idx_cpac_country ON public.country_payroll_admin_commissions(country_code);
GRANT SELECT ON public.country_payroll_admin_commissions TO authenticated;
GRANT ALL ON public.country_payroll_admin_commissions TO service_role;
ALTER TABLE public.country_payroll_admin_commissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cpac self read" ON public.country_payroll_admin_commissions FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (SELECT 1 FROM public.country_payroll_admins p
               WHERE p.id = payroll_admin_id AND p.user_id = auth.uid())
  );
-- No insert/update for users — only edge fn (service_role) writes.

-- 6) Audit log (immutable)
CREATE TABLE public.country_payroll_admin_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid,
  actor_role text,
  action text NOT NULL,
  target_payroll_admin_id uuid,
  target_application_id uuid,
  country_code text,
  before_data jsonb,
  after_data jsonb,
  ip_address text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_cpaa_country ON public.country_payroll_admin_audit(country_code);
CREATE INDEX idx_cpaa_actor ON public.country_payroll_admin_audit(actor_id);
GRANT SELECT ON public.country_payroll_admin_audit TO authenticated;
GRANT ALL ON public.country_payroll_admin_audit TO service_role;
ALTER TABLE public.country_payroll_admin_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY "audit admin or self" ON public.country_payroll_admin_audit FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR actor_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.country_payroll_admins p
               WHERE p.id = target_payroll_admin_id AND p.user_id = auth.uid())
  );

-- 7) Audit trigger
CREATE OR REPLACE FUNCTION public.country_payroll_admin_audit_fn()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.country_payroll_admin_audit
    (actor_id, action, target_payroll_admin_id, country_code, before_data, after_data)
  VALUES (
    auth.uid(),
    TG_OP,
    COALESCE(NEW.id, OLD.id),
    COALESCE(NEW.country_code, OLD.country_code),
    CASE WHEN TG_OP <> 'INSERT' THEN row_to_json(OLD)::jsonb END,
    CASE WHEN TG_OP <> 'DELETE' THEN row_to_json(NEW)::jsonb END
  );
  RETURN COALESCE(NEW, OLD);
END $$;

CREATE TRIGGER trg_cpa_audit
AFTER INSERT OR UPDATE OR DELETE ON public.country_payroll_admins
FOR EACH ROW EXECUTE FUNCTION public.country_payroll_admin_audit_fn();

-- 8) updated_at triggers
CREATE OR REPLACE FUNCTION public.csa_touch_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;
CREATE TRIGGER trg_csa_settings_uat BEFORE UPDATE ON public.country_super_admin_settings
  FOR EACH ROW EXECUTE FUNCTION public.csa_touch_updated_at();
CREATE TRIGGER trg_csa_apps_uat BEFORE UPDATE ON public.country_super_admin_applications
  FOR EACH ROW EXECUTE FUNCTION public.csa_touch_updated_at();
CREATE TRIGGER trg_cpa_uat BEFORE UPDATE ON public.country_payroll_admins
  FOR EACH ROW EXECUTE FUNCTION public.csa_touch_updated_at();

-- 9) Approval RPC (owner only). Enforces deposit + contract + commission ceiling.
CREATE OR REPLACE FUNCTION public.approve_country_super_admin_application(
  _application_id uuid,
  _allowed_payment_methods jsonb DEFAULT '[]'::jsonb,
  _auto_pay_enabled boolean DEFAULT false,
  _commission_percent numeric DEFAULT 25,
  _min_withdraw_usd numeric DEFAULT 0,
  _max_withdraw_usd numeric DEFAULT 0,
  _daily_cap_usd numeric DEFAULT 0
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_app public.country_super_admin_applications%ROWTYPE;
  v_settings public.country_super_admin_settings%ROWTYPE;
  v_new_id uuid;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only owner/admin can approve';
  END IF;
  SELECT * INTO v_app FROM public.country_super_admin_applications WHERE id = _application_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Application not found'; END IF;
  IF v_app.status <> 'pending' AND v_app.status <> 'under_review' THEN
    RAISE EXCEPTION 'Application not in reviewable state';
  END IF;
  SELECT * INTO v_settings FROM public.country_super_admin_settings LIMIT 1;
  IF v_app.deposit_amount_usd < v_settings.min_deposit_usd THEN
    RAISE EXCEPTION 'Deposit (%) below required minimum (%)', v_app.deposit_amount_usd, v_settings.min_deposit_usd;
  END IF;
  IF v_settings.require_signed_contract AND COALESCE(v_app.signed_contract_url,'') = '' THEN
    RAISE EXCEPTION 'Signed contract required';
  END IF;
  IF v_settings.require_official_contact AND
     (COALESCE(v_app.official_email,'') = '' OR COALESCE(v_app.official_phone,'') = '') THEN
    RAISE EXCEPTION 'Official email + phone required';
  END IF;
  IF _commission_percent > v_settings.max_commission_percent OR _commission_percent < 0 THEN
    RAISE EXCEPTION 'Commission outside allowed range';
  END IF;
  IF EXISTS (SELECT 1 FROM public.country_payroll_admins
             WHERE country_code = v_app.country_code AND status = 'active') THEN
    RAISE EXCEPTION 'Country % already has an active super admin', v_app.country_code;
  END IF;

  INSERT INTO public.country_payroll_admins
    (user_id, country_code, application_id, allowed_payment_methods, auto_pay_enabled,
     min_withdraw_usd, max_withdraw_usd, daily_cap_usd, commission_percent,
     deposit_amount_usd, contract_url, assigned_by)
  VALUES
    (v_app.applicant_user_id, v_app.country_code, v_app.id, _allowed_payment_methods, _auto_pay_enabled,
     _min_withdraw_usd, _max_withdraw_usd, _daily_cap_usd, _commission_percent,
     v_app.deposit_amount_usd, v_app.signed_contract_url, auth.uid())
  RETURNING id INTO v_new_id;

  UPDATE public.country_super_admin_applications
    SET status='approved', reviewer_id=auth.uid(), reviewed_at=now()
    WHERE id = _application_id;

  RETURN v_new_id;
END $$;

-- 10) Commission credit RPC (server-side only, called from edge fn on withdrawal completion)
CREATE OR REPLACE FUNCTION public.credit_country_payroll_commission(
  _withdrawal_source text,
  _withdrawal_request_id uuid,
  _country_code text,
  _withdrawal_amount_usd numeric
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_cfg public.country_payroll_admins%ROWTYPE;
  v_commission numeric;
  v_id uuid;
BEGIN
  SELECT * INTO v_cfg FROM public.country_payroll_admins
    WHERE country_code = _country_code AND status = 'active' LIMIT 1;
  IF NOT FOUND THEN RETURN NULL; END IF;

  v_commission := ROUND(_withdrawal_amount_usd * v_cfg.commission_percent / 100.0, 4);

  INSERT INTO public.country_payroll_admin_commissions
    (payroll_admin_id, country_code, withdrawal_request_id, withdrawal_source,
     withdrawal_amount_usd, commission_percent, commission_amount_usd)
  VALUES
    (v_cfg.id, _country_code, _withdrawal_request_id, _withdrawal_source,
     _withdrawal_amount_usd, v_cfg.commission_percent, v_commission)
  ON CONFLICT (withdrawal_source, withdrawal_request_id) WHERE status = 'credited' DO NOTHING
  RETURNING id INTO v_id;

  RETURN v_id;
END $$;

REVOKE ALL ON FUNCTION public.credit_country_payroll_commission(text, uuid, text, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.credit_country_payroll_commission(text, uuid, text, numeric) TO service_role;

REVOKE ALL ON FUNCTION public.approve_country_super_admin_application(uuid, jsonb, boolean, numeric, numeric, numeric, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_country_super_admin_application(uuid, jsonb, boolean, numeric, numeric, numeric, numeric) TO authenticated;
