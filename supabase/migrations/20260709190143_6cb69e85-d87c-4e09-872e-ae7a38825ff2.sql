
CREATE TABLE IF NOT EXISTS public.wallet_ledger_audit (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL,
  currency TEXT NOT NULL CHECK (currency IN ('beans','diamonds','coins')),
  delta NUMERIC NOT NULL,
  balance_before NUMERIC,
  balance_after NUMERIC,
  source_type TEXT NOT NULL DEFAULT 'unknown',
  source_id TEXT,
  source_table TEXT,
  payment_method TEXT,
  payment_reference TEXT,
  ip_address TEXT,
  device_id TEXT,
  user_agent TEXT,
  admin_id UUID,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.wallet_ledger_audit TO authenticated;
GRANT ALL ON public.wallet_ledger_audit TO service_role;

ALTER TABLE public.wallet_ledger_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view own ledger" ON public.wallet_ledger_audit;
CREATE POLICY "Users view own ledger"
  ON public.wallet_ledger_audit FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Service role manages ledger" ON public.wallet_ledger_audit;
CREATE POLICY "Service role manages ledger"
  ON public.wallet_ledger_audit FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_wla_user_created ON public.wallet_ledger_audit(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wla_currency_created ON public.wallet_ledger_audit(currency, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wla_source ON public.wallet_ledger_audit(source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_wla_created ON public.wallet_ledger_audit(created_at DESC);

CREATE OR REPLACE FUNCTION public.log_wallet_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ctx JSONB;
  v_source TEXT;
BEGIN
  BEGIN
    ctx := COALESCE(current_setting('app.wallet_ctx', true)::jsonb, '{}'::jsonb);
  EXCEPTION WHEN OTHERS THEN
    ctx := '{}'::jsonb;
  END;
  v_source := COALESCE(ctx->>'source_type', 'unknown');

  IF NEW.beans IS DISTINCT FROM OLD.beans THEN
    INSERT INTO public.wallet_ledger_audit(user_id, currency, delta, balance_before, balance_after, source_type, source_id, source_table, payment_method, payment_reference, ip_address, device_id, user_agent, admin_id, metadata)
    VALUES (NEW.id, 'beans', COALESCE(NEW.beans,0)-COALESCE(OLD.beans,0), OLD.beans, NEW.beans,
      v_source, ctx->>'source_id', ctx->>'source_table', ctx->>'payment_method', ctx->>'payment_reference',
      ctx->>'ip_address', ctx->>'device_id', ctx->>'user_agent',
      NULLIF(ctx->>'admin_id','')::uuid, ctx - ARRAY['source_type','source_id','source_table','payment_method','payment_reference','ip_address','device_id','user_agent','admin_id']);
  END IF;

  IF NEW.diamonds IS DISTINCT FROM OLD.diamonds THEN
    INSERT INTO public.wallet_ledger_audit(user_id, currency, delta, balance_before, balance_after, source_type, source_id, source_table, payment_method, payment_reference, ip_address, device_id, user_agent, admin_id, metadata)
    VALUES (NEW.id, 'diamonds', COALESCE(NEW.diamonds,0)-COALESCE(OLD.diamonds,0), OLD.diamonds, NEW.diamonds,
      v_source, ctx->>'source_id', ctx->>'source_table', ctx->>'payment_method', ctx->>'payment_reference',
      ctx->>'ip_address', ctx->>'device_id', ctx->>'user_agent',
      NULLIF(ctx->>'admin_id','')::uuid, ctx - ARRAY['source_type','source_id','source_table','payment_method','payment_reference','ip_address','device_id','user_agent','admin_id']);
  END IF;

  IF NEW.coins IS DISTINCT FROM OLD.coins THEN
    INSERT INTO public.wallet_ledger_audit(user_id, currency, delta, balance_before, balance_after, source_type, source_id, source_table, payment_method, payment_reference, ip_address, device_id, user_agent, admin_id, metadata)
    VALUES (NEW.id, 'coins', COALESCE(NEW.coins,0)-COALESCE(OLD.coins,0), OLD.coins, NEW.coins,
      v_source, ctx->>'source_id', ctx->>'source_table', ctx->>'payment_method', ctx->>'payment_reference',
      ctx->>'ip_address', ctx->>'device_id', ctx->>'user_agent',
      NULLIF(ctx->>'admin_id','')::uuid, ctx - ARRAY['source_type','source_id','source_table','payment_method','payment_reference','ip_address','device_id','user_agent','admin_id']);
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_wallet_change ON public.profiles;
CREATE TRIGGER trg_log_wallet_change
AFTER UPDATE OF beans, diamonds, coins ON public.profiles
FOR EACH ROW
WHEN (OLD.beans IS DISTINCT FROM NEW.beans OR OLD.diamonds IS DISTINCT FROM NEW.diamonds OR OLD.coins IS DISTINCT FROM NEW.coins)
EXECUTE FUNCTION public.log_wallet_change();

INSERT INTO public.wallet_ledger_audit(user_id, currency, delta, source_type, source_id, source_table, payment_method, payment_reference, metadata, created_at)
SELECT user_id, 'coins', coins_amount, COALESCE(transaction_type,'coin_tx'), id::text, 'coin_transactions', payment_method, payment_reference, jsonb_build_object('status', status), created_at
FROM public.coin_transactions
WHERE created_at > now() - interval '90 days' AND user_id IS NOT NULL;

INSERT INTO public.wallet_ledger_audit(user_id, currency, delta, source_type, source_id, source_table, payment_method, payment_reference, metadata, created_at)
SELECT user_id, 'coins', COALESCE(coins_amount,0) + COALESCE(bonus_coins,0), 'recharge', id::text, 'recharge_transactions', payment_method, COALESCE(order_id, google_order_id::text), jsonb_build_object('status', status, 'amount', amount, 'currency', currency), created_at
FROM public.recharge_transactions
WHERE created_at > now() - interval '90 days' AND status = 'completed' AND user_id IS NOT NULL;

INSERT INTO public.wallet_ledger_audit(user_id, currency, delta, source_type, source_id, source_table, metadata, created_at)
SELECT sender_id, 'coins', -COALESCE(total_coins, coin_amount, 0), 'gift_sent', id::text, 'gift_transactions', jsonb_build_object('receiver_id', receiver_id, 'gift_id', gift_id, 'quantity', quantity), created_at
FROM public.gift_transactions
WHERE created_at > now() - interval '90 days' AND sender_id IS NOT NULL;

INSERT INTO public.wallet_ledger_audit(user_id, currency, delta, source_type, source_id, source_table, metadata, created_at)
SELECT receiver_id, 'beans', receiver_beans, 'gift_received', id::text, 'gift_transactions', jsonb_build_object('sender_id', sender_id, 'gift_id', gift_id, 'quantity', quantity), created_at
FROM public.gift_transactions
WHERE created_at > now() - interval '90 days' AND receiver_id IS NOT NULL AND receiver_beans > 0;

INSERT INTO public.wallet_ledger_audit(user_id, currency, delta, source_type, source_id, source_table, metadata, created_at)
SELECT user_id, 'coins', reward_amount, 'daily_login', id::text, 'daily_login_claims', jsonb_build_object('day_number', day_number, 'reward_type', reward_type), claimed_at
FROM public.daily_login_claims
WHERE claimed_at > now() - interval '90 days' AND reward_amount > 0 AND user_id IS NOT NULL;

INSERT INTO public.wallet_ledger_audit(user_id, currency, delta, source_type, source_id, source_table, metadata, created_at)
SELECT user_id, 'coins', COALESCE(reward_amount, reward_coins, 0), 'rating_reward', id::text, 'rating_reward_claims', jsonb_build_object('status', status, 'platform', platform), COALESCE(reviewed_at, created_at)
FROM public.rating_reward_claims
WHERE created_at > now() - interval '90 days' AND status = 'approved' AND COALESCE(reward_amount, reward_coins, 0) > 0 AND user_id IS NOT NULL;

ALTER PUBLICATION supabase_realtime ADD TABLE public.wallet_ledger_audit;
