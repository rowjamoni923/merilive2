
-- 1) Extend safe_credit_diamonds to canonicalize into recharge_transactions
CREATE OR REPLACE FUNCTION public.safe_credit_diamonds(
  p_user_id uuid,
  p_amount integer,
  p_gateway text DEFAULT NULL::text,
  p_order_id text DEFAULT NULL::text,
  p_transaction_id text DEFAULT NULL::text,
  p_amount_usd numeric DEFAULT NULL::numeric,
  p_metadata jsonb DEFAULT NULL::jsonb
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _new_balance integer;
  _payment_ref text;
  _inserted_id uuid;
  _is_service boolean;
  _bonus_result jsonb;
  _invite_result jsonb;
BEGIN
  _is_service := COALESCE(auth.role(), '') = 'service_role';
  IF NOT _is_service AND NOT public.is_admin(auth.uid()) AND NOT public.is_active_admin_session() THEN
    RAISE EXCEPTION 'Unauthorized: safe_credit_diamonds requires service or admin context';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN json_build_object('success', false, 'error', 'Amount must be positive');
  END IF;
  _payment_ref := COALESCE(p_order_id, '') || ':' || COALESCE(p_transaction_id, '');
  IF _payment_ref = ':' THEN
    _payment_ref := COALESCE(p_gateway,'unknown') || ':' || p_user_id::text || ':' || p_amount::text || ':' || extract(epoch from clock_timestamp())::text;
  END IF;
  PERFORM set_config('app.bypass_profile_protection', 'true', true);
  BEGIN
    INSERT INTO public.coin_transactions (user_id, coins_amount, transaction_type, payment_method, payment_reference, status, notes)
    VALUES (p_user_id, p_amount, 'recharge', p_gateway, _payment_ref, 'completed', 'order:' || COALESCE(p_order_id, 'N/A') || ' txn:' || COALESCE(p_transaction_id, 'N/A'))
    RETURNING id INTO _inserted_id;
  EXCEPTION WHEN unique_violation THEN
    _invite_result := public.qualify_invitation_after_purchase(p_user_id, p_amount_usd, p_amount, p_gateway, _payment_ref);
    RETURN json_build_object('success', true, 'already_credited', true, 'payment_reference', _payment_ref, 'invitation', _invite_result);
  END;
  UPDATE public.profiles
     SET coins = COALESCE(coins, 0) + p_amount,
         total_recharged = COALESCE(total_recharged, 0) + p_amount
   WHERE id = p_user_id
   RETURNING coins INTO _new_balance;
  IF NOT FOUND THEN
    DELETE FROM public.coin_transactions WHERE id = _inserted_id;
    RETURN json_build_object('success', false, 'error', 'User not found');
  END IF;
  BEGIN
    INSERT INTO public.payment_reconciliation_log (user_id, gateway, order_id, transaction_id, amount_coins, amount_usd, metadata, status)
    VALUES (p_user_id, p_gateway, p_order_id, p_transaction_id, p_amount, p_amount_usd, p_metadata, 'credited');
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL;
  END;

  -- Phase 2b: canonicalize into recharge_transactions (skip google_play — that path uses process_google_play_purchase which already writes it)
  IF COALESCE(p_gateway, '') <> 'google_play' THEN
    BEGIN
      INSERT INTO public.recharge_transactions (
        user_id, order_id, payment_method, amount, coins_amount, bonus_coins,
        status, processed_at, created_at, updated_at, currency, usd_amount,
        coins_received, completed_at, currency_code, notes, purchase_source, transaction_id
      ) VALUES (
        p_user_id, p_order_id, COALESCE(p_gateway, 'unknown'), COALESCE(p_amount_usd, 0), p_amount, 0,
        'completed', now(), now(), now(), 'USD', p_amount_usd,
        p_amount, now(), 'USD',
        'Auto-canonicalized from safe_credit_diamonds. Ref: ' || _payment_ref,
        COALESCE(p_gateway, 'unknown'), COALESCE(p_transaction_id, p_order_id, _payment_ref)
      );
    EXCEPTION WHEN unique_violation THEN NULL;
    WHEN OTHERS THEN NULL;
    END;
  END IF;

  BEGIN
    _bonus_result := public._apply_recharge_bonuses_internal(p_user_id, p_amount, _inserted_id::text);
  EXCEPTION WHEN OTHERS THEN
    _bonus_result := jsonb_build_object('success', false, 'error', SQLERRM);
  END;

  _invite_result := public.qualify_invitation_after_purchase(p_user_id, p_amount_usd, p_amount, p_gateway, _payment_ref);

  RETURN json_build_object('success', true, 'new_balance', _new_balance, 'amount_credited', p_amount, 'payment_reference', _payment_ref, 'bonuses', _bonus_result, 'invitation', _invite_result);
END;
$function$;

-- 2) Backfill historic swift_pay credited rows into recharge_transactions
INSERT INTO public.recharge_transactions (
  user_id, order_id, payment_method, amount, coins_amount, bonus_coins,
  status, processed_at, created_at, updated_at, currency, usd_amount,
  coins_received, completed_at, currency_code, notes, purchase_source, transaction_id
)
SELECT
  spt.user_id,
  spt.id::text AS order_id,
  'swift_pay' AS payment_method,
  COALESCE(spt.price_usd, 0),
  spt.coins_amount,
  0,
  'completed',
  COALESCE(spt.credited_at, spt.updated_at, spt.created_at),
  spt.created_at,
  COALESCE(spt.updated_at, spt.credited_at, spt.created_at),
  'USD',
  spt.price_usd,
  spt.coins_amount,
  COALESCE(spt.credited_at, spt.updated_at),
  'USD',
  'Phase 2b backfill from swift_pay_topups.',
  'swift_pay',
  COALESCE(spt.payment_id, spt.id::text)
FROM public.swift_pay_topups spt
WHERE spt.status = 'credited'
  AND NOT EXISTS (
    SELECT 1 FROM public.recharge_transactions rt
     WHERE rt.payment_method = 'swift_pay'
       AND rt.transaction_id = COALESCE(spt.payment_id, spt.id::text)
  );

-- 3) Google Play RTDN event log
CREATE TABLE IF NOT EXISTS public.google_play_rtdn_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id text UNIQUE,
  publish_time timestamptz,
  package_name text,
  notification_type text,        -- 'subscription' | 'one_time_product' | 'test' | 'voided'
  event_type_code integer,       -- e.g. 1=SUBSCRIPTION_RECOVERED, 4=PURCHASE, 12=SUBSCRIPTION_REVOKED
  product_id text,
  purchase_token text,
  order_id text,
  raw_payload jsonb NOT NULL,
  processed boolean NOT NULL DEFAULT false,
  processed_at timestamptz,
  process_error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.google_play_rtdn_events TO authenticated;
GRANT ALL ON public.google_play_rtdn_events TO service_role;

ALTER TABLE public.google_play_rtdn_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view RTDN events"
  ON public.google_play_rtdn_events FOR SELECT
  TO authenticated
  USING (public.is_admin(auth.uid()) OR public.is_active_admin_session());

CREATE POLICY "Service role manages RTDN events"
  ON public.google_play_rtdn_events FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_rtdn_events_purchase_token ON public.google_play_rtdn_events(purchase_token);
CREATE INDEX IF NOT EXISTS idx_rtdn_events_processed ON public.google_play_rtdn_events(processed, created_at DESC);

-- 4) Pipeline health view for admin
CREATE OR REPLACE VIEW public.admin_recharge_pipeline_health AS
WITH windows AS (
  SELECT now() - interval '24 hours' AS since_24h,
         now() - interval '10 minutes' AS stuck_after
)
SELECT
  'google_play'::text AS gateway,
  (SELECT count(*) FROM public.google_play_purchase_attempts a WHERE a.created_at >= (SELECT since_24h FROM windows)) AS attempts_24h,
  (SELECT count(*) FROM public.google_play_purchase_attempts a WHERE a.status='completed' AND a.created_at >= (SELECT since_24h FROM windows)) AS completed_24h,
  (SELECT count(*) FROM public.google_play_purchase_attempts a WHERE a.status IN ('received','validating_with_google','google_verified') AND a.created_at < (SELECT stuck_after FROM windows)) AS stuck_pending,
  (SELECT max(created_at) FROM public.google_play_purchase_attempts) AS last_event_at
UNION ALL
SELECT
  'swift_pay',
  (SELECT count(*) FROM public.swift_pay_topups WHERE created_at >= (SELECT since_24h FROM windows)),
  (SELECT count(*) FROM public.swift_pay_topups WHERE status='credited' AND credited_at >= (SELECT since_24h FROM windows)),
  (SELECT count(*) FROM public.swift_pay_topups WHERE status IN ('pending','paid') AND created_at < (SELECT stuck_after FROM windows)),
  (SELECT max(created_at) FROM public.swift_pay_topups)
UNION ALL
SELECT
  'canonical_recharge_transactions',
  (SELECT count(*) FROM public.recharge_transactions WHERE created_at >= (SELECT since_24h FROM windows)),
  (SELECT count(*) FROM public.recharge_transactions WHERE status='completed' AND created_at >= (SELECT since_24h FROM windows)),
  (SELECT count(*) FROM public.recharge_transactions WHERE status IN ('pending','processing') AND created_at < (SELECT stuck_after FROM windows)),
  (SELECT max(created_at) FROM public.recharge_transactions);

GRANT SELECT ON public.admin_recharge_pipeline_health TO authenticated;
