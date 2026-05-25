-- Pkg333 Trader Wallet pass-1 hardening
-- 1) Revoke anon EXECUTE on admin/internal trader RPCs (defense-in-depth)
REVOKE EXECUTE ON FUNCTION public.assign_payroll_to_trader(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.assign_payroll_to_trader(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.check_topup_trader_gate(uuid, text, jsonb, bigint) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.check_topup_trader_gate(uuid, text, jsonb, bigint) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.is_approved_topup_trader(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.is_approved_topup_trader(uuid) TO authenticated;

-- 2) Add coin_trader_transfers audit row for trader→user path (parity with trader→agency)
CREATE OR REPLACE FUNCTION public.coin_trader_transfer_to_user(recipient_uid uuid, amount bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE me uuid := auth.uid(); j jsonb;
BEGIN
  IF NOT public.check_topup_trader_gate(
       me, 'coin_trader_transfer_to_user',
       jsonb_build_object('kind','uid','recipient_uid', recipient_uid),
       amount
     ) THEN
    IF me IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Not authenticated'); END IF;
    RETURN jsonb_build_object('success', false, 'error', 'Only approved L1-L5 helper traders can top up');
  END IF;
  j := public.helper_transfer_coins_to_user(me, recipient_uid, amount, 'trader_to_user');
  IF COALESCE((j->>'success')::boolean, false) THEN
    INSERT INTO public.coin_trader_transfers (user_id, counterparty_user_id, amount, transfer_type, status)
    VALUES (me, recipient_uid, amount, 'to_user', 'completed');
  END IF;
  RETURN j;
END; $function$;

REVOKE EXECUTE ON FUNCTION public.coin_trader_transfer_to_user(uuid, bigint) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.coin_trader_transfer_to_user(uuid, bigint) TO authenticated;