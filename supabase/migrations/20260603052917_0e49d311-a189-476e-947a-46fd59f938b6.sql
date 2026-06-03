-- Pkg342 (retry) — drop overloads first

DROP FUNCTION IF EXISTS public.admin_complete_payment_transaction(uuid);
DROP FUNCTION IF EXISTS public.admin_reject_payment_transaction(uuid, text);

CREATE FUNCTION public.admin_complete_payment_transaction(_transaction_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_tx public.payment_transactions%ROWTYPE;
  v_pkg record;
  v_credit_amount integer;
  v_balance_before bigint;
  v_balance_after bigint;
  v_payment_ref text;
BEGIN
  IF NOT public.is_active_admin_session() THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authorized');
  END IF;
  IF NOT public.admin_has_any_section_permission(
    ARRAY['finance-hub','recharge','topup-system','payment-gateways','manual-topup'], true
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authorized_for_finance');
  END IF;

  SELECT * INTO v_tx FROM public.payment_transactions WHERE id = _transaction_id FOR UPDATE;
  IF v_tx.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'transaction_not_found');
  END IF;
  IF COALESCE(v_tx.status, 'pending') = 'completed' THEN
    SELECT COALESCE(coins, 0) INTO v_balance_after FROM public.profiles WHERE id = v_tx.user_id;
    RETURN jsonb_build_object('success', true, 'alreadyProcessed', true,
      'creditedCoins', COALESCE(v_tx.diamonds_amount, 0), 'newBalance', COALESCE(v_balance_after, 0));
  END IF;
  IF COALESCE(v_tx.status, 'pending') NOT IN ('pending', 'processing') THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_status', 'status', v_tx.status);
  END IF;
  IF v_tx.package_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'missing_package');
  END IF;

  SELECT id, price_usd, coins_amount, COALESCE(bonus_coins, 0) AS bonus_coins,
         (coins_amount + COALESCE(bonus_coins, 0)) AS total_coins
    INTO v_pkg FROM public.coin_packages
   WHERE id = v_tx.package_id AND is_active = true LIMIT 1;
  IF v_pkg.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'package_not_found_or_inactive');
  END IF;

  v_credit_amount := GREATEST(COALESCE(v_pkg.total_coins, 0), 0);
  IF v_credit_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_package_coin_amount');
  END IF;

  SELECT COALESCE(coins, 0) INTO v_balance_before FROM public.profiles WHERE id = v_tx.user_id FOR UPDATE;
  IF v_balance_before IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'user_not_found');
  END IF;

  v_payment_ref := 'payment_tx:' || v_tx.id::text;
  PERFORM set_config('app.bypass_profile_protection', 'true', true);

  INSERT INTO public.coin_transactions (user_id, transaction_type, amount, balance_before, balance_after, description, reference_id)
  VALUES (v_tx.user_id, 'recharge', v_credit_amount, v_balance_before, v_balance_before + v_credit_amount,
          'Admin completed payment ' || v_tx.id::text, v_payment_ref);

  UPDATE public.profiles
     SET coins = COALESCE(coins, 0) + v_credit_amount,
         total_recharged = COALESCE(total_recharged, 0) + COALESCE(v_pkg.price_usd, 0)
   WHERE id = v_tx.user_id;

  UPDATE public.payment_transactions SET status = 'completed', updated_at = now() WHERE id = _transaction_id;

  v_balance_after := v_balance_before + v_credit_amount;
  RETURN jsonb_build_object('success', true, 'creditedCoins', v_credit_amount, 'newBalance', v_balance_after);
END;
$fn$;

CREATE FUNCTION public.admin_reject_payment_transaction(_transaction_id uuid, _reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE v_status text;
BEGIN
  IF NOT public.is_active_admin_session() THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authorized');
  END IF;
  IF NOT public.admin_has_any_section_permission(
    ARRAY['finance-hub','recharge','topup-system','payment-gateways','manual-topup'], true
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authorized_for_finance');
  END IF;

  SELECT status INTO v_status FROM public.payment_transactions WHERE id = _transaction_id FOR UPDATE;
  IF v_status IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'transaction_not_found'); END IF;
  IF v_status = 'completed' THEN RETURN jsonb_build_object('success', false, 'error', 'cannot_reject_completed'); END IF;

  UPDATE public.payment_transactions
     SET status = 'failed', updated_at = now(),
         notes = concat_ws(E'\n', NULLIF(notes, ''),
                  jsonb_build_object('admin_rejected_at', now(), 'reason', _reason)::text)
   WHERE id = _transaction_id;

  RETURN jsonb_build_object('success', true);
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.admin_complete_payment_transaction(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_reject_payment_transaction(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_complete_payment_transaction(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_reject_payment_transaction(uuid, text) TO anon, authenticated;

-- ============================================================
-- Lock 8 finance tables: read for any active admin, write for finance perms only
-- ============================================================
DO $do$
DECLARE
  rec record;
  v_perms text;
BEGIN
  FOR rec IN
    SELECT * FROM (VALUES
      ('topup_payment_methods',     ARRAY['finance-hub','topup-system','manual-topup','payment-gateways']),
      ('currency_rates',            ARRAY['finance-hub','coin-packages','topup-system','manual-topup','recharge']),
      ('payment_gateways',          ARRAY['finance-hub','payment-gateways','topup-system']),
      ('payment_transactions',      ARRAY['finance-hub','payment-gateways','recharge','topup-system']),
      ('recharge_transactions',     ARRAY['finance-hub','recharge','topup-system']),
      ('helper_transactions',       ARRAY['finance-hub','helper-management','topup-system']),
      ('user_beans_exchange_tiers', ARRAY['finance-hub','coin-packages','user-management'])
    ) AS t(tbl, perms)
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Admin session full access" ON public.%I', rec.tbl);
    EXECUTE format('DROP POLICY IF EXISTS "Admins can manage exchange tiers" ON public.%I', rec.tbl);
    EXECUTE format('DROP POLICY IF EXISTS pkg342_%I_admin_select ON public.%I', rec.tbl, rec.tbl);
    EXECUTE format('DROP POLICY IF EXISTS pkg342_%I_admin_write ON public.%I', rec.tbl, rec.tbl);

    v_perms := array_to_string(ARRAY(SELECT quote_literal(p) FROM unnest(rec.perms) AS p), ',');

    EXECUTE format(
      'CREATE POLICY pkg342_%I_admin_select ON public.%I FOR SELECT TO public USING (public.is_active_admin_session())',
      rec.tbl, rec.tbl
    );
    EXECUTE format(
      'CREATE POLICY pkg342_%I_admin_write ON public.%I FOR ALL TO public ' ||
      'USING (public.admin_has_any_section_permission(ARRAY[%s], true)) ' ||
      'WITH CHECK (public.admin_has_any_section_permission(ARRAY[%s], true))',
      rec.tbl, rec.tbl, v_perms, v_perms
    );
  END LOOP;
END
$do$;

-- coin_transfers stays insert/delete-denied; only finance-permitted admins may UPDATE
DROP POLICY IF EXISTS "Admin session full access" ON public.coin_transfers;
DROP POLICY IF EXISTS pkg342_coin_transfers_admin_select ON public.coin_transfers;
DROP POLICY IF EXISTS pkg342_coin_transfers_admin_update ON public.coin_transfers;
CREATE POLICY pkg342_coin_transfers_admin_select
  ON public.coin_transfers FOR SELECT TO public
  USING (public.is_active_admin_session());
CREATE POLICY pkg342_coin_transfers_admin_update
  ON public.coin_transfers FOR UPDATE TO public
  USING (public.admin_has_any_section_permission(ARRAY['finance-hub','user-management','topup-system'], true))
  WITH CHECK (public.admin_has_any_section_permission(ARRAY['finance-hub','user-management','topup-system'], true));

COMMENT ON POLICY pkg342_payment_gateways_admin_write ON public.payment_gateways IS
'Pkg342: write to payment_gateways requires finance-hub/payment-gateways/topup-system edit.';
COMMENT ON POLICY pkg342_currency_rates_admin_write ON public.currency_rates IS
'Pkg342: prevents any sub-admin from rewriting USD exchange rates app-wide.';
COMMENT ON POLICY pkg342_payment_transactions_admin_write ON public.payment_transactions IS
'Pkg342: prevents a non-finance sub-admin from flipping txn status to re-credit users.';