-- Pkg333 Trader Wallet pass-2b: fix runtime risks found during verification

ALTER TABLE public.helper_transactions
  ALTER COLUMN balance_before TYPE bigint USING balance_before::bigint,
  ALTER COLUMN balance_after TYPE bigint USING balance_after::bigint;

ALTER TABLE public.agency_diamond_transactions
  ALTER COLUMN transaction_type TYPE text;

CREATE OR REPLACE FUNCTION public.assign_payroll_to_trader(_withdrawal_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_withdrawal RECORD;
  v_helper RECORD;
  v_amount bigint;
  v_country text;
  v_balance_before bigint;
  v_balance_after bigint;
  v_admin_id uuid;
  v_helper_label text;
BEGIN
  IF NOT (public.is_admin(auth.uid()) OR public.is_active_admin_session()) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  SELECT * INTO v_withdrawal
  FROM public.agency_withdrawals
  WHERE id = _withdrawal_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Withdrawal not found');
  END IF;

  IF v_withdrawal.status <> 'pending' OR v_withdrawal.assigned_helper_id IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Withdrawal is not available for assignment');
  END IF;

  v_amount := FLOOR(COALESCE(v_withdrawal.amount, 0))::bigint;
  IF v_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid withdrawal amount');
  END IF;

  v_country := COALESCE(NULLIF(v_withdrawal.country_code, ''), NULLIF(v_withdrawal.payment_details->>'country_code', ''));
  IF v_country IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Withdrawal country is missing');
  END IF;

  SELECT th.*, COALESCE(NULLIF(p.display_name, ''), p.app_uid, 'Level 5 Helper') AS helper_label
  INTO v_helper
  FROM public.topup_helpers th
  LEFT JOIN public.profiles p ON p.id = th.user_id
  WHERE th.is_verified = true
    AND th.is_active = true
    AND th.payroll_enabled = true
    AND th.trader_level = 5
    AND th.country_code = v_country
    AND COALESCE(th.wallet_balance, 0) >= v_amount
  ORDER BY th.wallet_balance DESC, th.updated_at ASC NULLS LAST
  LIMIT 1
  FOR UPDATE OF th;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'No eligible Level 5 payroll helper found');
  END IF;

  v_helper_label := COALESCE(v_helper.helper_label, 'Level 5 Helper');
  v_balance_before := COALESCE(v_helper.wallet_balance, 0)::bigint;
  v_balance_after := v_balance_before - v_amount;

  UPDATE public.topup_helpers
  SET wallet_balance = v_balance_after,
      updated_at = now()
  WHERE id = v_helper.id;

  BEGIN
    v_admin_id := NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid;
  EXCEPTION WHEN OTHERS THEN
    v_admin_id := auth.uid();
  END;

  INSERT INTO public.helper_transactions (helper_id, transaction_type, amount, balance_before, balance_after, reference_id, description, user_id)
  VALUES (v_helper.id, 'agency_withdrawal_reserve', -v_amount, v_balance_before, v_balance_after, _withdrawal_id, 'Reserved for agency withdrawal assignment', v_admin_id);

  UPDATE public.agency_withdrawals
  SET assigned_helper_id = v_helper.id,
      status = 'processing',
      claim_locked_until = NULL,
      payment_details = COALESCE(payment_details, '{}'::jsonb) || jsonb_build_object('assigned_trader', v_helper_label, 'assigned_at', now(), 'assigned_by', v_admin_id),
      updated_at = now()
  WHERE id = _withdrawal_id;

  RETURN jsonb_build_object('success', true, 'helper_id', v_helper.id, 'helper_name', v_helper_label, 'reserved_amount', v_amount, 'new_wallet_balance', v_balance_after);
END;
$function$;