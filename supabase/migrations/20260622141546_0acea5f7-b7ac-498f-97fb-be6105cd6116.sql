
ALTER TABLE public.country_super_admin_applications
  ADD COLUMN IF NOT EXISTS full_address text,
  ADD COLUMN IF NOT EXISTS nid_country text,
  ADD COLUMN IF NOT EXISTS nid_number text,
  ADD COLUMN IF NOT EXISTS nid_front_url text,
  ADD COLUMN IF NOT EXISTS nid_back_url text,
  ADD COLUMN IF NOT EXISTS signature_data_url text,
  ADD COLUMN IF NOT EXISTS agreement_version text DEFAULT 'v1',
  ADD COLUMN IF NOT EXISTS agreement_signed_at timestamptz,
  ADD COLUMN IF NOT EXISTS agreement_pdf_url text,
  ADD COLUMN IF NOT EXISTS agreement_ip text,
  ADD COLUMN IF NOT EXISTS verification_checklist jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.country_payroll_admins
  ADD COLUMN IF NOT EXISTS helper_tier text NOT NULL DEFAULT 'L6_CONTRACT',
  ADD COLUMN IF NOT EXISTS priority integer NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS agreement_pdf_url text;

-- Upgrade approval RPC to require signed agreement + snapshot it
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
  IF v_app.status NOT IN ('pending','under_review') THEN
    RAISE EXCEPTION 'Application not in reviewable state';
  END IF;
  SELECT * INTO v_settings FROM public.country_super_admin_settings LIMIT 1;
  IF v_app.deposit_amount_usd < v_settings.min_deposit_usd THEN
    RAISE EXCEPTION 'Deposit (%) below required minimum (%)', v_app.deposit_amount_usd, v_settings.min_deposit_usd;
  END IF;
  IF v_settings.require_signed_contract AND
     (COALESCE(v_app.signed_contract_url,'') = '' AND COALESCE(v_app.agreement_pdf_url,'') = '') THEN
    RAISE EXCEPTION 'Signed agreement required';
  END IF;
  IF v_app.signature_data_url IS NULL OR v_app.agreement_signed_at IS NULL THEN
    RAISE EXCEPTION 'Applicant signature missing';
  END IF;
  IF COALESCE(v_app.nid_front_url,'') = '' THEN
    RAISE EXCEPTION 'National ID front image required';
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
     deposit_amount_usd, contract_url, agreement_pdf_url, assigned_by,
     helper_tier, priority)
  VALUES
    (v_app.applicant_user_id, v_app.country_code, v_app.id, _allowed_payment_methods, _auto_pay_enabled,
     _min_withdraw_usd, _max_withdraw_usd, _daily_cap_usd, _commission_percent,
     v_app.deposit_amount_usd,
     COALESCE(v_app.agreement_pdf_url, v_app.signed_contract_url),
     v_app.agreement_pdf_url,
     auth.uid(),
     'L6_CONTRACT', 100)
  RETURNING id INTO v_new_id;

  UPDATE public.country_super_admin_applications
    SET status='approved', reviewer_id=auth.uid(), reviewed_at=now()
    WHERE id = _application_id;

  RETURN v_new_id;
END $$;
