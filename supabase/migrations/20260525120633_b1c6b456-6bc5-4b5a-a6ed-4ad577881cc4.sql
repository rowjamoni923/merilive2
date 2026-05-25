-- ============================================================================
-- Pkg338: Beans & Diamonds Financial Lockdown
-- ============================================================================

-- 1) CRITICAL: claim_first_recharge_bonus_and_credit — unlimited mint exploit
CREATE OR REPLACE FUNCTION public.claim_first_recharge_bonus_and_credit(
  _user_id uuid,
  _bonus_id uuid,
  _original_amount integer,
  _bonus_amount integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_bonus public.first_recharge_bonus%ROWTYPE;
  v_calc_amount integer;
  v_new_balance integer;
BEGIN
  -- Hard auth gate: caller must be a real authenticated user and must be claiming for themselves.
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authenticated');
  END IF;

  IF _bonus_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'missing_bonus_id');
  END IF;

  IF COALESCE(_original_amount, 0) <= 0 OR _original_amount > 100000000 THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_original_amount');
  END IF;

  -- Ignore client-supplied _user_id entirely; force caller.
  _user_id := v_uid;

  -- Server-side lookup + active check
  SELECT * INTO v_bonus FROM public.first_recharge_bonus
   WHERE id = _bonus_id AND COALESCE(is_active, true) = true
   LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'bonus_not_found_or_inactive');
  END IF;

  -- Server-side amount calculation (NEVER trust client _bonus_amount).
  -- Priority: explicit bonus_coins flat → bonus_multiplier → bonus_percentage.
  IF COALESCE(v_bonus.bonus_coins, 0) > 0 THEN
    v_calc_amount := v_bonus.bonus_coins;
  ELSIF COALESCE(v_bonus.bonus_multiplier, 0) > 0 THEN
    v_calc_amount := FLOOR(_original_amount::numeric * v_bonus.bonus_multiplier)::integer;
  ELSIF COALESCE(v_bonus.bonus_percentage, 0) > 0 THEN
    v_calc_amount := FLOOR(_original_amount::numeric * v_bonus.bonus_percentage / 100.0)::integer;
  ELSE
    RETURN jsonb_build_object('success', false, 'error', 'bonus_amount_not_configured');
  END IF;

  IF v_calc_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'computed_bonus_zero');
  END IF;

  -- One-shot per user (unique index on first_recharge_claims.user_id already enforces this).
  INSERT INTO public.first_recharge_claims (user_id, bonus_id, original_amount, bonus_amount)
  VALUES (_user_id, _bonus_id, _original_amount, v_calc_amount);

  PERFORM set_config('app.bypass_profile_protection', 'true', true);

  UPDATE public.profiles
  SET coins = COALESCE(coins, 0) + v_calc_amount,
      updated_at = now()
  WHERE id = _user_id
  RETURNING coins INTO v_new_balance;

  IF NOT FOUND THEN
    DELETE FROM public.first_recharge_claims
      WHERE user_id = _user_id AND bonus_id = _bonus_id;
    RETURN jsonb_build_object('success', false, 'error', 'user_not_found');
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'bonus_amount', v_calc_amount,
    'new_balance', v_new_balance
  );
EXCEPTION WHEN unique_violation THEN
  SELECT COALESCE(coins, 0) INTO v_new_balance FROM public.profiles WHERE id = _user_id;
  RETURN jsonb_build_object('success', true, 'already_claimed', true, 'bonus_amount', 0, 'new_balance', COALESCE(v_new_balance, 0));
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.claim_first_recharge_bonus_and_credit(uuid, uuid, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_first_recharge_bonus_and_credit(uuid, uuid, integer, integer) TO authenticated;


-- 2) Privacy fix: get_transfer_wallet_sources must require self/service/admin
CREATE OR REPLACE FUNCTION public.get_transfer_wallet_sources(_user_id uuid)
RETURNS TABLE(
  helper_id uuid,
  helper_wallet_balance bigint,
  agency_id uuid,
  agency_diamond_balance bigint,
  personal_coins bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_is_service boolean := current_setting('request.jwt.claim.role', true) = 'service_role';
  profile_agency_id uuid;
BEGIN
  IF NOT (v_is_service
          OR (v_caller IS NOT NULL AND v_caller = _user_id)
          OR (v_caller IS NOT NULL AND public.is_admin(v_caller))) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT p.agency_id INTO profile_agency_id FROM public.profiles p WHERE p.id = _user_id;

  RETURN QUERY
  WITH latest_helper AS (
    SELECT h.id, COALESCE(h.wallet_balance, 0)::bigint AS wallet_balance
    FROM public.topup_helpers h
    WHERE h.user_id = _user_id
      AND COALESCE(h.is_verified, false) = true
      AND COALESCE(h.is_active, true) = true
    ORDER BY h.updated_at DESC NULLS LAST, h.created_at DESC NULLS LAST, h.id DESC
    LIMIT 1
  ),
  latest_owned_agency AS (
    SELECT a.id, COALESCE(a.diamond_balance, 0)::bigint AS diamond_balance
    FROM public.agencies a
    WHERE a.owner_id = _user_id AND COALESCE(a.is_active, true) = true
    ORDER BY a.updated_at DESC NULLS LAST, a.created_at DESC NULLS LAST, a.id DESC
    LIMIT 1
  ),
  latest_profile_agency AS (
    SELECT a.id, COALESCE(a.diamond_balance, 0)::bigint AS diamond_balance
    FROM public.agencies a
    WHERE a.id = profile_agency_id AND COALESCE(a.is_active, true) = true
    ORDER BY a.updated_at DESC NULLS LAST, a.created_at DESC NULLS LAST, a.id DESC
    LIMIT 1
  ),
  resolved_agency AS (
    SELECT * FROM latest_owned_agency
    UNION ALL
    SELECT * FROM latest_profile_agency
    WHERE NOT EXISTS (SELECT 1 FROM latest_owned_agency)
  )
  SELECT
    lh.id,
    COALESCE(lh.wallet_balance, 0),
    ra.id,
    COALESCE(ra.diamond_balance, 0),
    COALESCE((SELECT p.coins FROM public.profiles p WHERE p.id = _user_id), 0)::bigint
  FROM (SELECT 1) base
  LEFT JOIN latest_helper lh ON true
  LEFT JOIN resolved_agency ra ON true;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_transfer_wallet_sources(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_transfer_wallet_sources(uuid) TO authenticated;


-- 3) Defense in depth: revoke anonymous EXECUTE from all financial-mutation/read RPCs.
-- Internal admin/owner/self checks remain in place; this just stops anon probing.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, pg_catalog.pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind = 'f'
      AND has_function_privilege('anon', p.oid, 'EXECUTE')
      AND p.proname IN (
        'add_diamonds_to_agency',
        'admin_credit_beans',
        'admin_process_withdrawal',
        'admin_withdrawal_stats',
        'auto_assign_withdrawal_helper',
        'bulk_credit_call_earnings',
        'deduct_agency_wallet',
        'get_agency_diamond_balance',
        'get_agency_transfer_history',
        'release_expired_withdrawal_locks',
        'reset_host_weekly_policy_after_withdrawal',
        'reset_host_weekly_state_on_withdrawal',
        'submit_manual_recharge_proof',
        '_resolve_private_call_coins_per_minute'
      )
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM PUBLIC, anon', r.proname, r.args);
    EXECUTE format('GRANT  EXECUTE ON FUNCTION public.%I(%s) TO authenticated', r.proname, r.args);
  END LOOP;
END $$;
