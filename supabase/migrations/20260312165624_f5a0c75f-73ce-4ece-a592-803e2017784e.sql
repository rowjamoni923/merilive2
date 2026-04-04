
-- ═══ PAYMENT RECONCILIATION & HARDENING ═══

-- 1. Payment Reconciliation Log (audit trail for all payment events)
CREATE TABLE IF NOT EXISTS public.payment_reconciliation_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL, -- 'credit_attempt', 'credit_success', 'credit_failed', 'duplicate_blocked', 'reconciliation_mismatch'
  gateway text NOT NULL, -- 'stripe', 'zinipay', 'google_play', 'sslcommerz', 'aamarpay', 'admin_manual'
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  order_id text,
  transaction_id text,
  amount_coins integer DEFAULT 0,
  amount_usd numeric(10,2) DEFAULT 0,
  balance_before integer,
  balance_after integer,
  metadata jsonb DEFAULT '{}',
  ip_address text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Index for fast lookups
CREATE INDEX idx_reconciliation_user ON public.payment_reconciliation_log(user_id, created_at DESC);
CREATE INDEX idx_reconciliation_gateway ON public.payment_reconciliation_log(gateway, created_at DESC);
CREATE INDEX idx_reconciliation_event ON public.payment_reconciliation_log(event_type, created_at DESC);
CREATE INDEX idx_reconciliation_order ON public.payment_reconciliation_log(order_id);

-- RLS: Only service role can write, admins can read
ALTER TABLE public.payment_reconciliation_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on reconciliation"
  ON public.payment_reconciliation_log
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 2. Idempotent diamond credit function with built-in reconciliation
CREATE OR REPLACE FUNCTION public.safe_credit_diamonds(
  p_user_id uuid,
  p_amount integer,
  p_gateway text,
  p_order_id text,
  p_transaction_id text DEFAULT NULL,
  p_amount_usd numeric DEFAULT 0,
  p_metadata jsonb DEFAULT '{}'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_balance_before integer;
  v_balance_after integer;
  v_existing_count integer;
BEGIN
  -- STEP 1: Idempotency check — prevent double-crediting
  IF p_order_id IS NOT NULL AND p_order_id != '' THEN
    SELECT count(*) INTO v_existing_count
    FROM payment_reconciliation_log
    WHERE order_id = p_order_id
      AND event_type = 'credit_success'
      AND gateway = p_gateway;
    
    IF v_existing_count > 0 THEN
      INSERT INTO payment_reconciliation_log (event_type, gateway, user_id, order_id, transaction_id, amount_coins, metadata)
      VALUES ('duplicate_blocked', p_gateway, p_user_id, p_order_id, p_transaction_id, p_amount, 
              jsonb_build_object('reason', 'Already credited for this order'));
      
      RETURN jsonb_build_object('success', false, 'error', 'duplicate', 'message', 'Already processed');
    END IF;
  END IF;

  -- STEP 2: Get current balance
  SELECT COALESCE(coins, 0) INTO v_balance_before FROM profiles WHERE id = p_user_id;
  
  IF v_balance_before IS NULL THEN
    INSERT INTO payment_reconciliation_log (event_type, gateway, user_id, order_id, amount_coins, metadata)
    VALUES ('credit_failed', p_gateway, p_user_id, p_order_id, p_amount, 
            jsonb_build_object('reason', 'User not found'));
    RETURN jsonb_build_object('success', false, 'error', 'user_not_found');
  END IF;

  -- STEP 3: Credit diamonds (bypass protection trigger)
  PERFORM set_config('app.bypass_profile_protection', 'true', true);
  
  UPDATE profiles 
  SET coins = coins + p_amount, updated_at = now()
  WHERE id = p_user_id;
  
  -- STEP 4: Verify the credit
  SELECT COALESCE(coins, 0) INTO v_balance_after FROM profiles WHERE id = p_user_id;
  
  -- STEP 5: Reconciliation check
  IF v_balance_after != v_balance_before + p_amount THEN
    INSERT INTO payment_reconciliation_log (event_type, gateway, user_id, order_id, transaction_id, amount_coins, amount_usd, balance_before, balance_after, metadata)
    VALUES ('reconciliation_mismatch', p_gateway, p_user_id, p_order_id, p_transaction_id, p_amount, p_amount_usd, v_balance_before, v_balance_after,
            jsonb_build_object('expected_after', v_balance_before + p_amount, 'actual_after', v_balance_after));
    
    RETURN jsonb_build_object('success', false, 'error', 'balance_mismatch', 'balance_before', v_balance_before, 'balance_after', v_balance_after);
  END IF;

  -- STEP 6: Log success
  INSERT INTO payment_reconciliation_log (event_type, gateway, user_id, order_id, transaction_id, amount_coins, amount_usd, balance_before, balance_after, metadata)
  VALUES ('credit_success', p_gateway, p_user_id, p_order_id, p_transaction_id, p_amount, p_amount_usd, v_balance_before, v_balance_after, p_metadata);

  RETURN jsonb_build_object('success', true, 'balance_before', v_balance_before, 'balance_after', v_balance_after, 'credited', p_amount);
END;
$$;

-- 3. Reconciliation report function (for admin dashboard)
CREATE OR REPLACE FUNCTION public.get_payment_reconciliation_report(p_days integer DEFAULT 7)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start_date timestamptz := now() - (p_days || ' days')::interval;
  v_result json;
BEGIN
  SELECT json_build_object(
    'total_credits', (SELECT count(*) FROM payment_reconciliation_log WHERE event_type = 'credit_success' AND created_at >= v_start_date),
    'total_coins_credited', COALESCE((SELECT sum(amount_coins) FROM payment_reconciliation_log WHERE event_type = 'credit_success' AND created_at >= v_start_date), 0),
    'total_usd', COALESCE((SELECT sum(amount_usd) FROM payment_reconciliation_log WHERE event_type = 'credit_success' AND created_at >= v_start_date), 0),
    'duplicates_blocked', (SELECT count(*) FROM payment_reconciliation_log WHERE event_type = 'duplicate_blocked' AND created_at >= v_start_date),
    'failures', (SELECT count(*) FROM payment_reconciliation_log WHERE event_type = 'credit_failed' AND created_at >= v_start_date),
    'mismatches', (SELECT count(*) FROM payment_reconciliation_log WHERE event_type = 'reconciliation_mismatch' AND created_at >= v_start_date),
    'by_gateway', (
      SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json)
      FROM (
        SELECT gateway, 
               count(*) FILTER (WHERE event_type = 'credit_success') AS success_count,
               COALESCE(sum(amount_coins) FILTER (WHERE event_type = 'credit_success'), 0) AS total_coins,
               COALESCE(sum(amount_usd) FILTER (WHERE event_type = 'credit_success'), 0) AS total_usd,
               count(*) FILTER (WHERE event_type = 'duplicate_blocked') AS duplicates
        FROM payment_reconciliation_log
        WHERE created_at >= v_start_date
        GROUP BY gateway
      ) t
    )
  ) INTO v_result;
  
  RETURN v_result;
END;
$$;
