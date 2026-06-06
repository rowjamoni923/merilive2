
-- Pkg425: Trader wallet history visibility + realtime instant updates.

-- 1. User self-SELECT on helper_transactions so traders can see their own
--    helper wallet ledger (self-recharge, transfer-out, admin top-up credit, etc.).
--    Previously only admins could read this table → trader history was empty.
DROP POLICY IF EXISTS "pkg425_helper_transactions_user_self_select" ON public.helper_transactions;
CREATE POLICY "pkg425_helper_transactions_user_self_select"
  ON public.helper_transactions
  FOR SELECT
  USING (
    user_id = auth.uid()
    OR helper_id IN (SELECT id FROM public.topup_helpers WHERE user_id = auth.uid())
  );

-- 2. Ensure trader-history tables are in supabase_realtime publication so the
--    Profile transfer modal can subscribe and refresh history instantly.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['helper_transactions','coin_transfers','coin_trader_transfers']
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;

-- 3. Admin top-up approval now writes a helper_transactions ledger row so the
--    trader sees an "Admin credited my wallet" entry in history.
CREATE OR REPLACE FUNCTION public.admin_approve_helper_topup(_request_id uuid, _amount_usd numeric DEFAULT NULL::numeric, _admin_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _req RECORD; _rate_cfg jsonb; _usd_per_100k numeric; _amount numeric; _diamonds bigint; _admin_id uuid;
  _balance_before bigint; _balance_after bigint; _helper_user_id uuid;
BEGIN
  IF public.current_admin_id_from_header() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated as admin');
  END IF;
  IF NOT public.admin_has_any_section_permission(
    ARRAY['finance-hub','topup-system','manual-topup','helper-management','level-5-helpers'], true
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Topup/finance permission required');
  END IF;

  SELECT CASE WHEN jsonb_typeof(setting_value::jsonb) = 'object' THEN setting_value::jsonb ELSE NULL END
    INTO _rate_cfg FROM public.app_settings WHERE setting_key = 'trader_wallet_topup_rate';
  _usd_per_100k := NULLIF((_rate_cfg->>'usd_per_100k_diamonds'),'')::numeric;
  IF _usd_per_100k IS NULL OR _usd_per_100k <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'trader_wallet_topup_rate not configured. Set "usd_per_100k_diamonds" in Pricing Hub → Helper.');
  END IF;

  SELECT * INTO _req FROM public.helper_topup_requests WHERE id = _request_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'Request not found'); END IF;
  IF _req.status IS DISTINCT FROM 'pending' THEN RETURN jsonb_build_object('success', false, 'error', 'Already processed'); END IF;

  _amount := COALESCE(_amount_usd, _req.amount_usd);
  IF _amount IS NULL OR _amount <= 0 THEN RETURN jsonb_build_object('success', false, 'error', 'Invalid USD amount'); END IF;
  _diamonds := floor(_amount * 100000.0 / _usd_per_100k)::bigint;
  IF _diamonds <= 0 THEN RETURN jsonb_build_object('success', false, 'error', 'Computed diamonds <= 0; check rate or USD amount'); END IF;

  _admin_id := COALESCE(_req.processed_by, public.current_admin_id_from_header(), auth.uid());

  -- Snapshot balance before/after for ledger
  SELECT wallet_balance, user_id INTO _balance_before, _helper_user_id
    FROM public.topup_helpers WHERE id = _req.helper_id FOR UPDATE;
  _balance_before := COALESCE(_balance_before, 0);
  _balance_after := _balance_before + _diamonds;

  PERFORM set_config('app.bypass_profile_protection', 'true', true);
  UPDATE public.topup_helpers
     SET wallet_balance = _balance_after,
         total_bought   = COALESCE(total_bought,   0) + _diamonds,
         updated_at     = now()
   WHERE id = _req.helper_id;
  PERFORM set_config('app.bypass_profile_protection', 'false', true);

  -- Pkg425: ledger entry so trader sees the admin credit in history
  INSERT INTO public.helper_transactions
    (helper_id, transaction_type, amount, balance_before, balance_after, reference_id, description, user_id)
  VALUES
    (_req.helper_id, 'admin_topup_credit', _diamonds, _balance_before::integer, _balance_after::integer,
     _request_id, 'Admin approved manual top-up ($' || _amount || ')', _helper_user_id);

  UPDATE public.helper_topup_requests
     SET status = 'approved', amount_usd = _amount, coin_amount = _diamonds,
         admin_notes = COALESCE(_admin_notes, admin_notes),
         processed_at = now(), processed_by = _admin_id
   WHERE id = _request_id;

  INSERT INTO public.notifications (user_id, type, title, message, data)
  SELECT h.user_id, 'topup_approved', '💎 Trader Wallet Topped Up!',
         'Your manual top-up of $' || _amount || ' has been approved. ' || _diamonds::text || ' diamonds added to your Trader Wallet.',
         jsonb_build_object('diamonds', _diamonds, 'amount_usd', _amount, 'rate_usd_per_100k', _usd_per_100k, 'request_id', _request_id)
    FROM public.topup_helpers h WHERE h.id = _req.helper_id;

  RETURN jsonb_build_object('success', true, 'request_id', _request_id, 'diamonds', _diamonds, 'amount_usd', _amount, 'rate_usd_per_100k', _usd_per_100k);
END;
$function$;
