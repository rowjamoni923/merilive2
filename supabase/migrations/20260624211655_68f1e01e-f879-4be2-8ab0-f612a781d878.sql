
-- ============================================================
-- 1. Settings (singleton row id = 1)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.csa_diamond_settings (
  id smallint PRIMARY KEY DEFAULT 1,
  min_purchase_usd numeric NOT NULL DEFAULT 5000,
  diamonds_per_usd numeric NOT NULL DEFAULT 1000,   -- e.g. $1 = 1000 diamonds (admin sets)
  visibility_threshold_diamonds bigint NOT NULL DEFAULT 5000000, -- 50 lakh
  owner_fallback_enabled boolean NOT NULL DEFAULT true,
  auto_credit_on_payment boolean NOT NULL DEFAULT true,
  notes text,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (id = 1)
);
GRANT SELECT ON public.csa_diamond_settings TO authenticated;
GRANT ALL ON public.csa_diamond_settings TO service_role;
ALTER TABLE public.csa_diamond_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Everyone can read settings" ON public.csa_diamond_settings
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage settings" ON public.csa_diamond_settings
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

INSERT INTO public.csa_diamond_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 2. CSA diamond balance
-- ============================================================
ALTER TABLE public.country_super_admins
  ADD COLUMN IF NOT EXISTS diamond_balance bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_purchased_diamonds bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_spent_diamonds bigint NOT NULL DEFAULT 0;

-- ============================================================
-- 3. Purchases
-- ============================================================
CREATE TABLE IF NOT EXISTS public.csa_diamond_purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  csa_user_id uuid NOT NULL,
  agency_id uuid,
  country_code text NOT NULL,
  amount_usd numeric NOT NULL,
  diamonds_to_credit bigint NOT NULL,
  diamonds_per_usd_snapshot numeric NOT NULL,
  gateway text,
  gateway_ref text,
  gateway_payload jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','failed','cancelled','credited')),
  paid_at timestamptz,
  credited_at timestamptz,
  credited_by uuid,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.csa_diamond_purchases TO authenticated;
GRANT ALL ON public.csa_diamond_purchases TO service_role;
ALTER TABLE public.csa_diamond_purchases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "CSA can see own purchases" ON public.csa_diamond_purchases
  FOR SELECT TO authenticated
  USING (csa_user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins manage purchases" ON public.csa_diamond_purchases
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE INDEX IF NOT EXISTS idx_csa_purchases_user ON public.csa_diamond_purchases(csa_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_csa_purchases_status ON public.csa_diamond_purchases(status);

-- ============================================================
-- 4. Ledger (every diamond movement)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.csa_diamond_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  csa_user_id uuid,            -- nullable when fallback to owner pool
  country_code text NOT NULL,
  change_amount bigint NOT NULL,  -- positive = credit, negative = debit
  balance_after bigint,
  reason text NOT NULL,        -- 'purchase' | 'helper_topup_debit' | 'owner_fallback' | 'admin_adjust'
  related_purchase_id uuid REFERENCES public.csa_diamond_purchases(id) ON DELETE SET NULL,
  related_helper_order_id uuid,
  related_helper_id uuid,
  related_user_id uuid,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.csa_diamond_ledger TO authenticated;
GRANT ALL ON public.csa_diamond_ledger TO service_role;
ALTER TABLE public.csa_diamond_ledger ENABLE ROW LEVEL SECURITY;
CREATE POLICY "CSA sees own ledger" ON public.csa_diamond_ledger
  FOR SELECT TO authenticated
  USING (csa_user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins manage ledger" ON public.csa_diamond_ledger
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE INDEX IF NOT EXISTS idx_csa_ledger_user ON public.csa_diamond_ledger(csa_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_csa_ledger_country ON public.csa_diamond_ledger(country_code, created_at DESC);

-- ============================================================
-- 5. Mark CSA-added helper payment methods (visibility split)
-- ============================================================
ALTER TABLE public.helper_country_payment_methods
  ADD COLUMN IF NOT EXISTS added_by_csa boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS csa_user_id uuid;

-- Re-create CSA upsert function to set the flags
CREATE OR REPLACE FUNCTION public.csa_upsert_withdrawal_method(
  _id uuid, _method_name text, _method_type text, _account_name text,
  _account_number text, _bank_name text, _instructions text, _logo_url text,
  _is_active boolean, _display_order int
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_country text; v_id uuid; v_existing text;
BEGIN
  SELECT country_code INTO v_country FROM public.country_super_admins
   WHERE user_id = auth.uid() AND is_active = true
     AND (expires_at IS NULL OR expires_at > now());
  IF v_country IS NULL THEN RAISE EXCEPTION 'Not a CSA'; END IF;

  IF _id IS NULL THEN
    INSERT INTO public.helper_country_payment_methods
      (country_code, country_name, method_name, payment_method_name, method_type, payment_type,
       account_name, account_number, bank_name, instructions, logo_url, icon_url,
       is_active, display_order, added_by_csa, csa_user_id)
    VALUES (v_country, v_country, _method_name, _method_name, _method_type, _method_type,
       _account_name, _account_number, _bank_name, _instructions, _logo_url, _logo_url,
       COALESCE(_is_active,true), COALESCE(_display_order,0), true, auth.uid())
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
      is_active = _is_active, display_order = _display_order,
      added_by_csa = true, csa_user_id = auth.uid()
     WHERE id = _id
     RETURNING id INTO v_id;
  END IF;
  RETURN v_id;
END $$;

-- ============================================================
-- 6. Admin: settings RPCs
-- ============================================================
CREATE OR REPLACE FUNCTION public.admin_get_csa_diamond_settings()
RETURNS public.csa_diamond_settings LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' STABLE
AS $$ SELECT * FROM public.csa_diamond_settings WHERE id = 1 $$;

CREATE OR REPLACE FUNCTION public.admin_upsert_csa_diamond_settings(
  _min_purchase_usd numeric,
  _diamonds_per_usd numeric,
  _visibility_threshold_diamonds bigint,
  _owner_fallback_enabled boolean,
  _auto_credit_on_payment boolean,
  _notes text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN
    RAISE EXCEPTION 'Admins only';
  END IF;
  IF _min_purchase_usd <= 0 OR _diamonds_per_usd <= 0 OR _visibility_threshold_diamonds < 0 THEN
    RAISE EXCEPTION 'Invalid values';
  END IF;
  UPDATE public.csa_diamond_settings SET
    min_purchase_usd = _min_purchase_usd,
    diamonds_per_usd = _diamonds_per_usd,
    visibility_threshold_diamonds = _visibility_threshold_diamonds,
    owner_fallback_enabled = _owner_fallback_enabled,
    auto_credit_on_payment = _auto_credit_on_payment,
    notes = _notes,
    updated_by = auth.uid(),
    updated_at = now()
   WHERE id = 1;
END $$;

-- ============================================================
-- 7. CSA: create purchase order (min check + diamond calc)
-- ============================================================
CREATE OR REPLACE FUNCTION public.csa_create_diamond_purchase(
  _amount_usd numeric,
  _gateway text DEFAULT 'crypto'
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_country text; v_agency uuid; v_min numeric; v_rate numeric;
  v_diamonds bigint; v_id uuid;
BEGIN
  SELECT country_code, agency_id INTO v_country, v_agency
   FROM public.country_super_admins
   WHERE user_id = auth.uid() AND is_active = true
     AND (expires_at IS NULL OR expires_at > now());
  IF v_country IS NULL THEN RAISE EXCEPTION 'Not a CSA'; END IF;

  SELECT min_purchase_usd, diamonds_per_usd INTO v_min, v_rate
    FROM public.csa_diamond_settings WHERE id = 1;
  IF _amount_usd < v_min THEN
    RAISE EXCEPTION 'Minimum purchase is %', v_min;
  END IF;

  v_diamonds := floor(_amount_usd * v_rate)::bigint;

  INSERT INTO public.csa_diamond_purchases
    (csa_user_id, agency_id, country_code, amount_usd, diamonds_to_credit,
     diamonds_per_usd_snapshot, gateway, status)
  VALUES (auth.uid(), v_agency, v_country, _amount_usd, v_diamonds,
     v_rate, COALESCE(_gateway,'crypto'), 'pending')
  RETURNING id INTO v_id;

  RETURN jsonb_build_object(
    'purchase_id', v_id,
    'amount_usd', _amount_usd,
    'diamonds_to_credit', v_diamonds,
    'rate', v_rate,
    'status', 'pending'
  );
END $$;

-- ============================================================
-- 8. Admin / webhook: credit a purchase
-- ============================================================
CREATE OR REPLACE FUNCTION public.admin_credit_csa_diamonds(
  _purchase_id uuid,
  _gateway_ref text DEFAULT NULL,
  _gateway_payload jsonb DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  p public.csa_diamond_purchases;
  v_balance bigint;
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin') OR auth.uid() IS NULL) THEN
    -- auth.uid() IS NULL → called by service role from webhook
    RAISE EXCEPTION 'Admins/service only';
  END IF;
  SELECT * INTO p FROM public.csa_diamond_purchases WHERE id = _purchase_id FOR UPDATE;
  IF p.id IS NULL THEN RAISE EXCEPTION 'Purchase not found'; END IF;
  IF p.status = 'credited' THEN
    RETURN jsonb_build_object('already_credited', true, 'purchase_id', p.id);
  END IF;

  UPDATE public.country_super_admins
     SET diamond_balance = diamond_balance + p.diamonds_to_credit,
         total_purchased_diamonds = total_purchased_diamonds + p.diamonds_to_credit,
         updated_at = now()
   WHERE user_id = p.csa_user_id
   RETURNING diamond_balance INTO v_balance;

  UPDATE public.csa_diamond_purchases
     SET status = 'credited',
         credited_at = now(),
         credited_by = auth.uid(),
         paid_at = COALESCE(paid_at, now()),
         gateway_ref = COALESCE(_gateway_ref, gateway_ref),
         gateway_payload = COALESCE(_gateway_payload, gateway_payload),
         updated_at = now()
   WHERE id = p.id;

  INSERT INTO public.csa_diamond_ledger
    (csa_user_id, country_code, change_amount, balance_after, reason, related_purchase_id, notes)
  VALUES (p.csa_user_id, p.country_code, p.diamonds_to_credit, v_balance, 'purchase', p.id,
          'Auto-credited from ' || COALESCE(p.gateway,'gateway'));

  INSERT INTO public.notifications (user_id, type, title, message, data)
  VALUES (p.csa_user_id, 'csa_diamonds_credited', 'Diamonds Credited',
          p.diamonds_to_credit || ' diamonds credited for $' || p.amount_usd || ' purchase.',
          jsonb_build_object('purchase_id', p.id, 'diamonds', p.diamonds_to_credit, 'amount_usd', p.amount_usd));

  RETURN jsonb_build_object('purchase_id', p.id, 'credited', p.diamonds_to_credit, 'balance_after', v_balance);
END $$;

-- ============================================================
-- 9. Debit on helper top-up (with owner fallback)
-- ============================================================
CREATE OR REPLACE FUNCTION public.csa_debit_for_helper_topup(
  _country_code text,
  _diamonds bigint,
  _helper_id uuid,
  _user_id uuid,
  _helper_order_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_csa public.country_super_admins;
  v_fallback boolean; v_new_balance bigint;
  v_country text := upper(_country_code);
BEGIN
  IF _diamonds <= 0 THEN RAISE EXCEPTION 'Invalid diamond amount'; END IF;

  SELECT owner_fallback_enabled INTO v_fallback FROM public.csa_diamond_settings WHERE id = 1;

  SELECT * INTO v_csa FROM public.country_super_admins
   WHERE country_code = v_country AND is_active = true
     AND (expires_at IS NULL OR expires_at > now())
   FOR UPDATE;

  -- No CSA for this country → owner pool
  IF v_csa.user_id IS NULL THEN
    INSERT INTO public.csa_diamond_ledger
      (csa_user_id, country_code, change_amount, balance_after, reason,
       related_helper_order_id, related_helper_id, related_user_id, notes)
    VALUES (NULL, v_country, -_diamonds, NULL, 'owner_fallback',
            _helper_order_id, _helper_id, _user_id, 'No CSA in country');
    RETURN jsonb_build_object('source', 'owner', 'csa_user_id', null, 'debited', _diamonds);
  END IF;

  IF v_csa.diamond_balance >= _diamonds THEN
    UPDATE public.country_super_admins
       SET diamond_balance = diamond_balance - _diamonds,
           total_spent_diamonds = total_spent_diamonds + _diamonds,
           updated_at = now()
     WHERE user_id = v_csa.user_id
     RETURNING diamond_balance INTO v_new_balance;

    INSERT INTO public.csa_diamond_ledger
      (csa_user_id, country_code, change_amount, balance_after, reason,
       related_helper_order_id, related_helper_id, related_user_id)
    VALUES (v_csa.user_id, v_country, -_diamonds, v_new_balance, 'helper_topup_debit',
            _helper_order_id, _helper_id, _user_id);

    RETURN jsonb_build_object('source', 'csa', 'csa_user_id', v_csa.user_id,
                              'debited', _diamonds, 'balance_after', v_new_balance);
  END IF;

  -- Insufficient CSA balance
  IF NOT v_fallback THEN
    RAISE EXCEPTION 'CSA balance insufficient (% < %) and owner fallback disabled', v_csa.diamond_balance, _diamonds;
  END IF;

  -- Partial debit from CSA, rest from owner
  IF v_csa.diamond_balance > 0 THEN
    INSERT INTO public.csa_diamond_ledger
      (csa_user_id, country_code, change_amount, balance_after, reason,
       related_helper_order_id, related_helper_id, related_user_id, notes)
    VALUES (v_csa.user_id, v_country, -v_csa.diamond_balance, 0, 'helper_topup_debit',
            _helper_order_id, _helper_id, _user_id, 'Partial — rest from owner pool');

    UPDATE public.country_super_admins
       SET diamond_balance = 0,
           total_spent_diamonds = total_spent_diamonds + v_csa.diamond_balance,
           updated_at = now()
     WHERE user_id = v_csa.user_id;
  END IF;

  INSERT INTO public.csa_diamond_ledger
    (csa_user_id, country_code, change_amount, balance_after, reason,
     related_helper_order_id, related_helper_id, related_user_id, notes)
  VALUES (NULL, v_country, -(_diamonds - v_csa.diamond_balance), NULL, 'owner_fallback',
          _helper_order_id, _helper_id, _user_id, 'CSA empty, owner covered remainder');

  -- Notify CSA balance empty
  INSERT INTO public.notifications (user_id, type, title, message, data)
  VALUES (v_csa.user_id, 'csa_diamonds_empty', 'Diamond Balance Empty',
          'Your diamond balance is empty. Owner pool is currently covering helper top-ups. Recharge to keep your country running smoothly.',
          jsonb_build_object('country_code', v_country));

  RETURN jsonb_build_object('source', 'mixed', 'csa_user_id', v_csa.user_id,
                            'csa_portion', v_csa.diamond_balance,
                            'owner_portion', _diamonds - v_csa.diamond_balance);
END $$;

-- ============================================================
-- 10. Visibility helper: 'csa' or 'official'
-- ============================================================
CREATE OR REPLACE FUNCTION public.csa_get_country_payment_visibility(_country_code text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' STABLE AS $$
DECLARE
  v_threshold bigint; v_balance bigint; v_country text := upper(_country_code);
BEGIN
  SELECT visibility_threshold_diamonds INTO v_threshold FROM public.csa_diamond_settings WHERE id = 1;
  SELECT diamond_balance INTO v_balance FROM public.country_super_admins
   WHERE country_code = v_country AND is_active = true
     AND (expires_at IS NULL OR expires_at > now());
  IF v_balance IS NULL THEN RETURN 'official'; END IF;
  IF v_balance >= COALESCE(v_threshold, 5000000) THEN RETURN 'csa'; END IF;
  RETURN 'official';
END $$;

-- ============================================================
-- 11. CSA: list own purchases + ledger
-- ============================================================
CREATE OR REPLACE FUNCTION public.csa_my_diamond_summary()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' STABLE AS $$
DECLARE v jsonb;
BEGIN
  SELECT jsonb_build_object(
    'balance', csa.diamond_balance,
    'total_purchased', csa.total_purchased_diamonds,
    'total_spent', csa.total_spent_diamonds,
    'country_code', csa.country_code,
    'visibility_now', public.csa_get_country_payment_visibility(csa.country_code),
    'settings', (SELECT row_to_json(s) FROM public.csa_diamond_settings s WHERE id = 1)
  ) INTO v
  FROM public.country_super_admins csa
  WHERE csa.user_id = auth.uid() AND csa.is_active = true
    AND (csa.expires_at IS NULL OR csa.expires_at > now());
  RETURN v;
END $$;

-- ============================================================
-- GRANTS
-- ============================================================
GRANT EXECUTE ON FUNCTION public.admin_get_csa_diamond_settings() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_upsert_csa_diamond_settings(numeric,numeric,bigint,boolean,boolean,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.csa_create_diamond_purchase(numeric,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_credit_csa_diamonds(uuid,text,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.csa_debit_for_helper_topup(text,bigint,uuid,uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.csa_get_country_payment_visibility(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.csa_my_diamond_summary() TO authenticated;
