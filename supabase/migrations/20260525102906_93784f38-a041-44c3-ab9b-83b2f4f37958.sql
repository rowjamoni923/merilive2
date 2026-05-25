-- Pkg331 pass-1: helper-trader system security hardening
-- =========================================================
-- Audited: create_helper_order RPC, helper_orders/upgrade/topup/withdrawal RLS,
-- and helper-related SECURITY DEFINER RPCs (anon EXECUTE surface).

-- ---------------------------------------------------------
-- 1) helper_orders: BEFORE INSERT validation trigger
--    Was: RLS allowed any auth user to INSERT with status='completed',
--    arbitrary helper_id/coin_amount/amount_usd (bypassing create_helper_order
--    RPC entirely). Forge a "completed" order without paying, set huge
--    coin_amount, point at any helper, forge payment_proof.
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_helper_orders_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_is_service boolean := current_setting('request.jwt.claim.role', true) = 'service_role';
  v_pkg record;
  v_helper record;
BEGIN
  -- service-role / admin / admin-session bypass (RPC contexts)
  IF v_is_service
     OR public.is_admin(v_caller)
     OR public.is_active_admin_session() THEN
    RETURN NEW;
  END IF;

  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  -- buyer identity must be caller
  IF NEW.user_id IS DISTINCT FROM v_caller THEN
    RAISE EXCEPTION 'user_id must match auth.uid()' USING ERRCODE = '42501';
  END IF;

  -- only pending allowed on insert
  IF COALESCE(NEW.status, 'pending') <> 'pending' THEN
    RAISE EXCEPTION 'New orders must start as pending' USING ERRCODE = '42501';
  END IF;
  NEW.status := 'pending';

  -- block end-users from setting admin-only / processing fields
  NEW.processed_at := NULL;
  NEW.commission_amount := NULL;
  NEW.commission_rate := NULL;

  -- target helper must exist and be active+verified
  SELECT id, is_active, is_verified, wallet_balance
    INTO v_helper
    FROM public.topup_helpers
   WHERE id = NEW.helper_id;
  IF NOT FOUND OR v_helper.is_active IS NOT TRUE OR v_helper.is_verified IS NOT TRUE THEN
    RAISE EXCEPTION 'Helper unavailable' USING ERRCODE = '42501';
  END IF;

  -- coin_amount + amount_usd MUST match the referenced package (server-priced)
  IF NEW.package_id IS NOT NULL THEN
    SELECT coins, price_usd INTO v_pkg
      FROM public.coin_packages
     WHERE id = NEW.package_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Invalid package' USING ERRCODE = '22023';
    END IF;
    IF NEW.coin_amount IS NULL OR NEW.coin_amount <> v_pkg.coins THEN
      NEW.coin_amount := v_pkg.coins;
    END IF;
    IF NEW.amount_usd IS NULL OR ABS(COALESCE(NEW.amount_usd,0) - v_pkg.price_usd) > 0.01 THEN
      NEW.amount_usd := v_pkg.price_usd;
    END IF;
  ELSE
    -- no package → block; we don't support free-form orders from end users
    RAISE EXCEPTION 'package_id required' USING ERRCODE = '22023';
  END IF;

  -- sanity bounds
  IF NEW.coin_amount IS NULL OR NEW.coin_amount <= 0 OR NEW.coin_amount > 1000000000 THEN
    RAISE EXCEPTION 'Invalid coin_amount' USING ERRCODE = '22023';
  END IF;

  -- clamp text lengths
  NEW.payment_method := left(COALESCE(NEW.payment_method, ''), 80);
  NEW.currency_code  := left(COALESCE(NEW.currency_code, 'USD'), 8);
  NEW.user_country_code := left(COALESCE(NEW.user_country_code, ''), 8);
  NEW.notes := left(COALESCE(NEW.notes, ''), 1000);
  NEW.provider_transaction_id := left(COALESCE(NEW.provider_transaction_id, ''), 200);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_helper_orders_insert ON public.helper_orders;
CREATE TRIGGER guard_helper_orders_insert
BEFORE INSERT ON public.helper_orders
FOR EACH ROW EXECUTE FUNCTION public.guard_helper_orders_insert();

-- ---------------------------------------------------------
-- 2) helper_orders: BEFORE UPDATE allow-list
--    Was: helper could UPDATE own orders with no column allow-list → rewrite
--    customer's coin_amount / amount_usd / user_id / payment_proof, change
--    package, point at different user, etc. Buyer could similarly mutate
--    their own row freely.
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_helper_orders_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_is_service boolean := current_setting('request.jwt.claim.role', true) = 'service_role';
  v_is_admin boolean := public.is_admin(v_caller) OR public.is_active_admin_session();
  v_is_helper boolean;
  v_is_buyer boolean;
BEGIN
  IF v_is_service OR v_is_admin THEN
    RETURN NEW;
  END IF;

  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  v_is_helper := EXISTS (
    SELECT 1 FROM public.topup_helpers th
     WHERE th.id = OLD.helper_id AND th.user_id = v_caller
  );
  v_is_buyer := OLD.user_id = v_caller;

  IF NOT (v_is_helper OR v_is_buyer) THEN
    RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
  END IF;

  -- immutable identity / pricing fields (only admin/service may change these)
  IF NEW.helper_id IS DISTINCT FROM OLD.helper_id
     OR NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.package_id IS DISTINCT FROM OLD.package_id
     OR NEW.coin_amount IS DISTINCT FROM OLD.coin_amount
     OR NEW.amount_usd IS DISTINCT FROM OLD.amount_usd
     OR NEW.amount_local IS DISTINCT FROM OLD.amount_local
     OR NEW.currency_code IS DISTINCT FROM OLD.currency_code
     OR NEW.commission_amount IS DISTINCT FROM OLD.commission_amount
     OR NEW.commission_rate IS DISTINCT FROM OLD.commission_rate
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.user_country_code IS DISTINCT FROM OLD.user_country_code
     OR NEW.user_payment_proof IS DISTINCT FROM OLD.user_payment_proof
     OR NEW.provider_transaction_id IS DISTINCT FROM OLD.provider_transaction_id THEN
    RAISE EXCEPTION 'Field not updatable by client' USING ERRCODE = '42501';
  END IF;

  -- status whitelist for non-admin
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status NOT IN ('pending','processing','completed','failed','cancelled') THEN
      RAISE EXCEPTION 'Invalid status' USING ERRCODE = '22023';
    END IF;
    -- helpers may move forward; buyers may only cancel a pending order
    IF v_is_buyer AND NOT v_is_helper THEN
      IF NOT (OLD.status = 'pending' AND NEW.status = 'cancelled') THEN
        RAISE EXCEPTION 'Buyers can only cancel pending orders' USING ERRCODE = '42501';
      END IF;
    END IF;
    -- once terminal, no flip back
    IF OLD.status IN ('completed','failed','cancelled') THEN
      RAISE EXCEPTION 'Order is final' USING ERRCODE = '42501';
    END IF;
  END IF;

  -- length clamps on free-form
  IF NEW.notes IS NOT NULL THEN NEW.notes := left(NEW.notes, 1000); END IF;
  IF NEW.payment_method IS NOT NULL THEN NEW.payment_method := left(NEW.payment_method, 80); END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_helper_orders_update ON public.helper_orders;
CREATE TRIGGER guard_helper_orders_update
BEFORE UPDATE ON public.helper_orders
FOR EACH ROW EXECUTE FUNCTION public.guard_helper_orders_update();

-- ---------------------------------------------------------
-- 3) helper_withdrawal_requests: drop bogus client INSERT policy
--    Was: WITH CHECK (auth.uid() = helper_id) — helper_id refers to
--    topup_helpers.id elsewhere; this let any auth user pollute the
--    admin queue with forged rows (status, diamond_reward, approved_at
--    are all unconstrained columns). No client path actually inserts
--    into this table — admin/service-role only.
-- ---------------------------------------------------------
DROP POLICY IF EXISTS "Helpers can create their own withdrawal request" ON public.helper_withdrawal_requests;

-- ---------------------------------------------------------
-- 4) helper_upgrade_requests: BEFORE INSERT validation trigger
--    Was: INSERT WITH CHECK only verified helper ownership; client could
--    set requested_level=999 (skip levels), set current_level mismatched
--    with topup_helpers.trader_level, or stack multiple pending requests.
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_helper_upgrade_requests_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_is_service boolean := current_setting('request.jwt.claim.role', true) = 'service_role';
  v_helper record;
  v_max_level integer;
BEGIN
  IF v_is_service OR public.is_admin(v_caller) OR public.is_active_admin_session() THEN
    RETURN NEW;
  END IF;
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT id, user_id, trader_level
    INTO v_helper
    FROM public.topup_helpers
   WHERE id = NEW.helper_id;
  IF NOT FOUND OR v_helper.user_id <> v_caller THEN
    RAISE EXCEPTION 'Not your helper account' USING ERRCODE = '42501';
  END IF;

  NEW.status := 'pending';
  NEW.reviewed_by := NULL;
  NEW.reviewed_at := NULL;
  NEW.admin_notes := NULL;

  -- server-authoritative current level
  NEW.current_level := COALESCE(v_helper.trader_level, 1);

  -- upper bound from trader_level_tiers (fallback 5)
  SELECT COALESCE(MAX(level_number), 5) INTO v_max_level
    FROM public.trader_level_tiers
   WHERE is_active = true;

  IF NEW.requested_level IS NULL
     OR NEW.requested_level <= NEW.current_level
     OR NEW.requested_level > v_max_level
     OR NEW.requested_level > NEW.current_level + 1 THEN
    RAISE EXCEPTION 'Requested level must be exactly current_level + 1 (max %)', v_max_level
      USING ERRCODE = '22023';
  END IF;

  -- block stacking duplicate pending requests
  IF EXISTS (
    SELECT 1 FROM public.helper_upgrade_requests r
     WHERE r.helper_id = NEW.helper_id AND r.status = 'pending'
  ) THEN
    RAISE EXCEPTION 'A pending upgrade request already exists' USING ERRCODE = '23505';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_helper_upgrade_requests_insert ON public.helper_upgrade_requests;
CREATE TRIGGER guard_helper_upgrade_requests_insert
BEFORE INSERT ON public.helper_upgrade_requests
FOR EACH ROW EXECUTE FUNCTION public.guard_helper_upgrade_requests_insert();

-- ---------------------------------------------------------
-- 5) helper_topup_requests: missing INSERT RLS + validation trigger
--    Was: NO INSERT policy → HelperDashboard topup flow was silently
--    blocked under RLS. Add policy + trigger that enforces:
--      - helper_id owned by caller
--      - status='pending' forced
--      - amount_usd / coin_amount > 0 and bounded
--      - user_id forced to helper.user_id (= caller)
--      - admin-only fields nulled
-- ---------------------------------------------------------
CREATE POLICY "u_ins_hlp_topup"
ON public.helper_topup_requests
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.topup_helpers th
     WHERE th.id = helper_topup_requests.helper_id
       AND th.user_id = auth.uid()
  )
);

CREATE OR REPLACE FUNCTION public.guard_helper_topup_requests_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_is_service boolean := current_setting('request.jwt.claim.role', true) = 'service_role';
  v_helper record;
BEGIN
  IF v_is_service OR public.is_admin(v_caller) OR public.is_active_admin_session() THEN
    RETURN NEW;
  END IF;
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT id, user_id INTO v_helper FROM public.topup_helpers WHERE id = NEW.helper_id;
  IF NOT FOUND OR v_helper.user_id <> v_caller THEN
    RAISE EXCEPTION 'Not your helper account' USING ERRCODE = '42501';
  END IF;

  NEW.user_id := v_helper.user_id;
  NEW.status := 'pending';
  NEW.processed_by := NULL;
  NEW.processed_at := NULL;
  NEW.admin_notes := NULL;

  IF COALESCE(NEW.amount_usd, 0) <= 0 OR COALESCE(NEW.amount_usd, 0) > 1000000 THEN
    RAISE EXCEPTION 'Invalid amount_usd' USING ERRCODE = '22023';
  END IF;
  IF COALESCE(NEW.coin_amount, 0) <= 0 OR COALESCE(NEW.coin_amount, 0) > 100000000000 THEN
    RAISE EXCEPTION 'Invalid coin_amount' USING ERRCODE = '22023';
  END IF;

  NEW.payment_method := left(COALESCE(NEW.payment_method,''), 80);
  NEW.transaction_id := left(COALESCE(NEW.transaction_id,''), 200);
  NEW.notes := left(COALESCE(NEW.notes,''), 1000);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_helper_topup_requests_insert ON public.helper_topup_requests;
CREATE TRIGGER guard_helper_topup_requests_insert
BEFORE INSERT ON public.helper_topup_requests
FOR EACH ROW EXECUTE FUNCTION public.guard_helper_topup_requests_insert();

-- ---------------------------------------------------------
-- 6) create_helper_order: server-side pricing
--    Was: trusted client _amount_usd / _amount_local — buyer could pay
--    $0.01 for a 10000-coin package; order created with bogus pricing.
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_helper_order(
  _package_id uuid,
  _payment_method text,
  _amount_usd numeric,
  _amount_local numeric,
  _currency_code text DEFAULT 'BDT',
  _country_code text DEFAULT 'BD',
  _payment_proof text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _user_id uuid := auth.uid();
  _helper_id uuid;
  _package record;
  _order_id uuid;
  _safe_country text;
  _safe_currency text;
  _safe_method text;
BEGIN
  IF _user_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  _safe_country := upper(left(COALESCE(_country_code, 'BD'), 8));
  _safe_currency := upper(left(COALESCE(_currency_code, 'USD'), 8));
  _safe_method := left(COALESCE(_payment_method, ''), 80);

  SELECT id, coins, price_usd INTO _package
    FROM public.coin_packages WHERE id = _package_id;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Invalid package');
  END IF;

  SELECT th.id INTO _helper_id
  FROM public.topup_helpers th
  WHERE th.is_active = true AND th.is_verified = true
    AND th.wallet_balance >= _package.coins
    AND (th.country_code = _safe_country OR _safe_country = ANY(th.supported_countries))
  ORDER BY CASE WHEN th.country_code = _safe_country THEN 0 ELSE 1 END,
           th.display_order ASC, th.wallet_balance DESC
  LIMIT 1;
  IF _helper_id IS NULL THEN
    SELECT th.id INTO _helper_id FROM public.topup_helpers th
    WHERE th.is_active = true AND th.is_verified = true
      AND th.wallet_balance >= _package.coins
    ORDER BY th.wallet_balance DESC LIMIT 1;
  END IF;
  IF _helper_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'No helper available at the moment');
  END IF;

  -- ignore client-supplied _amount_usd; use server price.
  -- _amount_local kept (UI display); clamp to reasonable bounds.
  IF _amount_local IS NULL OR _amount_local < 0 OR _amount_local > 100000000 THEN
    _amount_local := NULL;
  END IF;

  INSERT INTO public.helper_orders (
    helper_id, user_id, package_id, coin_amount, amount_usd, amount_local,
    currency_code, payment_method, user_country_code, user_payment_proof, status
  ) VALUES (
    _helper_id, _user_id, _package_id, _package.coins, _package.price_usd, _amount_local,
    _safe_currency, _safe_method, _safe_country, _payment_proof, 'pending'
  ) RETURNING id INTO _order_id;

  RETURN json_build_object('success', true, 'order_id', _order_id, 'helper_id', _helper_id);
END;
$$;

-- ---------------------------------------------------------
-- 7) Defense-in-depth: REVOKE anon/PUBLIC on sensitive helper RPCs
-- ---------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.create_helper_order(uuid, text, numeric, numeric, text, text, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.create_helper_order(uuid, text, numeric, numeric, text, text, text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.apply_as_topup_helper(jsonb) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.apply_as_topup_helper(jsonb) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.set_topup_helper_listing(boolean) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.set_topup_helper_listing(boolean) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.helper_process_agency_withdrawal(uuid, uuid, text, text, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.helper_process_agency_withdrawal(uuid, uuid, text, text, text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.find_available_helper(text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.find_available_helper(text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.admin_approve_helper(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_process_helper_transaction(uuid, text) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_update_helper_application(uuid, uuid, text, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.admin_approve_helper(uuid) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.admin_process_helper_transaction(uuid, text) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.admin_update_helper_application(uuid, uuid, text, text) TO authenticated;