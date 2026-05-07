-- Section 04 (resend): canonical signatures + alias RPCs

-- 0) Drop legacy overloads
DROP FUNCTION IF EXISTS public.helper_transfer_diamonds_to_self(integer, uuid);
DROP FUNCTION IF EXISTS public.helper_transfer_diamonds_to_self(uuid, bigint);

-- 1) Self-recharge: agency first, then trader wallet
CREATE OR REPLACE FUNCTION public.helper_transfer_diamonds_to_self(
  _user_id uuid,
  _amount bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  helper_rec RECORD;
  agency_rec RECORD;
  profile_agency_id uuid;
  remaining bigint;
  helper_deducted bigint := 0;
  agency_deducted bigint := 0;
  new_wallet bigint;
  new_coins bigint;
BEGIN
  IF _amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Amount must be positive');
  END IF;

  SELECT id, wallet_balance INTO helper_rec
  FROM topup_helpers
  WHERE user_id = _user_id AND COALESCE(is_active, true) = true AND COALESCE(is_verified, false) = true
  ORDER BY updated_at DESC NULLS LAST LIMIT 1
  FOR UPDATE;

  SELECT p.agency_id INTO profile_agency_id FROM profiles p WHERE p.id = _user_id;

  IF profile_agency_id IS NOT NULL THEN
    SELECT id, diamond_balance INTO agency_rec
    FROM agencies WHERE id = profile_agency_id AND COALESCE(is_active, true) = true
    FOR UPDATE;
  END IF;

  IF agency_rec IS NULL THEN
    SELECT id, diamond_balance INTO agency_rec
    FROM agencies WHERE owner_id = _user_id AND COALESCE(is_active, true) = true
    ORDER BY updated_at DESC NULLS LAST LIMIT 1
    FOR UPDATE;
  END IF;

  remaining := _amount;

  IF agency_rec IS NOT NULL AND COALESCE(agency_rec.diamond_balance, 0) > 0 AND remaining > 0 THEN
    agency_deducted := LEAST(remaining, agency_rec.diamond_balance::bigint);
    UPDATE agencies SET diamond_balance = diamond_balance - agency_deducted, updated_at = now() WHERE id = agency_rec.id;
    remaining := remaining - agency_deducted;
  END IF;

  IF helper_rec IS NOT NULL AND COALESCE(helper_rec.wallet_balance, 0) > 0 AND remaining > 0 THEN
    helper_deducted := LEAST(remaining, helper_rec.wallet_balance::bigint);
    UPDATE topup_helpers SET wallet_balance = wallet_balance - helper_deducted, updated_at = now() WHERE id = helper_rec.id;
    remaining := remaining - helper_deducted;
  END IF;

  IF remaining > 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient balance');
  END IF;

  PERFORM set_config('app.bypass_profile_protection', 'true', true);
  UPDATE profiles SET coins = COALESCE(coins, 0) + _amount WHERE id = _user_id RETURNING coins INTO new_coins;

  IF helper_rec IS NOT NULL THEN
    SELECT wallet_balance INTO new_wallet FROM topup_helpers WHERE id = helper_rec.id;
  ELSE
    new_wallet := 0;
  END IF;

  INSERT INTO coin_transactions (user_id, coins_amount, transaction_type, status, notes)
  VALUES (_user_id, _amount, 'self_recharge', 'completed', 'Helper self recharge');

  RETURN jsonb_build_object(
    'success', true,
    'new_wallet_balance', COALESCE(new_wallet, 0),
    'new_coins', COALESCE(new_coins, 0),
    'helper_deducted', helper_deducted,
    'agency_deducted', agency_deducted
  );
END;
$$;

REVOKE ALL ON FUNCTION public.helper_transfer_diamonds_to_self(uuid, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.helper_transfer_diamonds_to_self(uuid, bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.helper_transfer_diamonds_to_self(uuid, bigint) TO service_role;

-- 2) agencies_public with diamond_balance
DROP VIEW IF EXISTS public.agencies_public CASCADE;
CREATE VIEW public.agencies_public
WITH (security_invoker = on) AS
SELECT
  id,
  name,
  agency_code,
  logo_url,
  level,
  total_hosts,
  total_agents,
  is_active,
  parent_agency_id,
  created_at,
  diamond_balance
FROM public.agencies
WHERE COALESCE(is_active, true) = true;

GRANT SELECT ON public.agencies_public TO anon, authenticated;

-- 3) coin_traders self view
CREATE OR REPLACE VIEW public.coin_traders
WITH (security_invoker = on) AS
SELECT
  th.id,
  th.user_id,
  th.wallet_balance::bigint AS wallet_balance,
  CASE
    WHEN COALESCE(th.is_active, true) AND COALESCE(th.is_verified, false) THEN 'active'::text
    ELSE 'inactive'::text
  END AS status,
  th.created_at,
  th.updated_at
FROM public.topup_helpers th
WHERE th.user_id = auth.uid();

GRANT SELECT ON public.coin_traders TO authenticated;

-- 4) coin_trader_transfers log
CREATE TABLE IF NOT EXISTS public.coin_trader_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  counterparty_user_id uuid REFERENCES public.profiles (id),
  counterparty_agency_id uuid REFERENCES public.agencies (id),
  amount bigint NOT NULL,
  transfer_type text NOT NULL,
  status text NOT NULL DEFAULT 'completed',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_coin_trader_transfers_user_created
  ON public.coin_trader_transfers (user_id, created_at DESC);

ALTER TABLE public.coin_trader_transfers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "coin_trader_transfers_select_own" ON public.coin_trader_transfers;
CREATE POLICY "coin_trader_transfers_select_own"
  ON public.coin_trader_transfers
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "coin_trader_transfers_no_insert" ON public.coin_trader_transfers;
CREATE POLICY "coin_trader_transfers_no_insert"
  ON public.coin_trader_transfers
  FOR INSERT
  TO authenticated
  WITH CHECK (false);

GRANT SELECT ON public.coin_trader_transfers TO authenticated;

-- 5) RPC wrappers
DROP FUNCTION IF EXISTS public.coin_trader_transfer_to_user(uuid, bigint);
CREATE OR REPLACE FUNCTION public.coin_trader_transfer_to_user(
  recipient_uid uuid,
  amount bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := auth.uid();
BEGIN
  IF me IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;
  RETURN public.helper_transfer_coins_to_user(amount::integer, recipient_uid, me, 'trader_to_user');
END;
$$;

REVOKE ALL ON FUNCTION public.coin_trader_transfer_to_user(uuid, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.coin_trader_transfer_to_user(uuid, bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.coin_trader_transfer_to_user(uuid, bigint) TO service_role;

DROP FUNCTION IF EXISTS public.coin_trader_transfer_to_agency(uuid, bigint);
CREATE OR REPLACE FUNCTION public.coin_trader_transfer_to_agency(
  target_agency_id uuid,
  amount bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := auth.uid();
  j jsonb;
BEGIN
  IF me IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;
  j := public.helper_transfer_diamonds_to_agency(amount::integer, me, 'trader_to_agency', target_agency_id);
  IF COALESCE((j->>'success')::boolean, false) THEN
    INSERT INTO public.coin_trader_transfers (
      user_id,
      counterparty_agency_id,
      amount,
      transfer_type,
      status
    )
    VALUES (me, target_agency_id, amount, 'to_agency', 'completed');
  END IF;
  RETURN j;
END;
$$;

REVOKE ALL ON FUNCTION public.coin_trader_transfer_to_agency(uuid, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.coin_trader_transfer_to_agency(uuid, bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.coin_trader_transfer_to_agency(uuid, bigint) TO service_role;

CREATE OR REPLACE FUNCTION public.coin_trader_self_recharge(amount bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := auth.uid();
BEGIN
  IF me IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;
  RETURN public.helper_transfer_diamonds_to_self(me, amount);
END;
$$;

REVOKE ALL ON FUNCTION public.coin_trader_self_recharge(bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.coin_trader_self_recharge(bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.coin_trader_self_recharge(bigint) TO service_role;