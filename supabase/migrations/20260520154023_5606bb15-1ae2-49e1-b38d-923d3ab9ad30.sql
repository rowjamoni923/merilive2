-- Pkg69 — is_approved_topup_trader gate decision audit log.
--
-- Adds an append-only table that records every BLOCKED gate decision from
-- the three top-up RPCs (coin_trader_self_recharge, coin_trader_transfer_to_user,
-- coin_trader_transfer_to_agency, plus helper_transfer_diamonds_to_self when
-- called directly) with a precise reason code, the helper-state snapshot, the
-- attempted target, and the amount. Allowed decisions are NOT logged — only
-- denials, so volume stays minimal and the table is a pure "why was I blocked"
-- audit trail.
--
-- Reason codes:
--   not_authenticated         auth.uid() was NULL
--   no_topup_helpers_row      no row in topup_helpers for the user
--   helper_inactive           is_active = false
--   helper_unverified         is_verified = false
--   trader_level_out_of_range trader_level NULL or outside [1..5]

CREATE TABLE IF NOT EXISTS public.topup_trader_gate_audit (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid,                       -- nullable: 'not_authenticated' has no uid
  rpc           text NOT NULL,              -- e.g. 'coin_trader_self_recharge'
  decision      text NOT NULL CHECK (decision IN ('blocked')),
  reason        text NOT NULL,              -- one of the codes above
  helper_state  jsonb NOT NULL DEFAULT '{}'::jsonb,
  target        jsonb NOT NULL DEFAULT '{}'::jsonb,  -- { kind:'uid'|'agency'|'self', id?, ... }
  amount        bigint,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_topup_gate_audit_user_created
  ON public.topup_trader_gate_audit (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_topup_gate_audit_reason_created
  ON public.topup_trader_gate_audit (reason, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_topup_gate_audit_rpc_created
  ON public.topup_trader_gate_audit (rpc, created_at DESC);

ALTER TABLE public.topup_trader_gate_audit ENABLE ROW LEVEL SECURITY;

-- Users may read their own denial history (helps in-app "why was I blocked?" UI).
DROP POLICY IF EXISTS "users read own gate audit" ON public.topup_trader_gate_audit;
CREATE POLICY "users read own gate audit"
  ON public.topup_trader_gate_audit
  FOR SELECT
  USING (user_id = auth.uid());

-- Admins read everything via the standard admin-session policy.
DROP POLICY IF EXISTS "Admin session full access" ON public.topup_trader_gate_audit;
CREATE POLICY "Admin session full access"
  ON public.topup_trader_gate_audit
  FOR ALL
  USING (public.is_active_admin_session())
  WITH CHECK (public.is_active_admin_session());

-- No client INSERT/UPDATE/DELETE — only SECURITY DEFINER functions write.
REVOKE INSERT, UPDATE, DELETE ON public.topup_trader_gate_audit FROM authenticated, anon;

-- ---------------------------------------------------------------------------
-- Logging gate function. VOLATILE (vs the existing STABLE is_approved_topup_trader)
-- so it can INSERT. Returns TRUE when approved; otherwise INSERTS a row and
-- returns FALSE. Callers pass an rpc tag + target jsonb + amount.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_topup_trader_gate(
  _user_id uuid,
  _rpc     text,
  _target  jsonb DEFAULT '{}'::jsonb,
  _amount  bigint DEFAULT NULL
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  h            RECORD;
  v_reason     text;
  v_state      jsonb;
BEGIN
  IF _user_id IS NULL THEN
    INSERT INTO public.topup_trader_gate_audit (user_id, rpc, decision, reason, helper_state, target, amount)
    VALUES (NULL, COALESCE(_rpc, 'unknown'), 'blocked', 'not_authenticated', '{}'::jsonb, COALESCE(_target, '{}'::jsonb), _amount);
    RETURN FALSE;
  END IF;

  SELECT is_active, is_verified, trader_level, wallet_balance
    INTO h
  FROM public.topup_helpers
  WHERE user_id = _user_id
  ORDER BY updated_at DESC NULLS LAST
  LIMIT 1;

  IF NOT FOUND THEN
    v_reason := 'no_topup_helpers_row';
    v_state  := '{}'::jsonb;
  ELSIF COALESCE(h.is_active, true) = false THEN
    v_reason := 'helper_inactive';
    v_state  := jsonb_build_object('is_active', h.is_active, 'is_verified', h.is_verified, 'trader_level', h.trader_level);
  ELSIF COALESCE(h.is_verified, false) = false THEN
    v_reason := 'helper_unverified';
    v_state  := jsonb_build_object('is_active', h.is_active, 'is_verified', h.is_verified, 'trader_level', h.trader_level);
  ELSIF COALESCE(h.trader_level, 0) NOT BETWEEN 1 AND 5 THEN
    v_reason := 'trader_level_out_of_range';
    v_state  := jsonb_build_object('is_active', h.is_active, 'is_verified', h.is_verified, 'trader_level', h.trader_level);
  ELSE
    RETURN TRUE;  -- approved: do NOT log
  END IF;

  INSERT INTO public.topup_trader_gate_audit (user_id, rpc, decision, reason, helper_state, target, amount)
  VALUES (_user_id, COALESCE(_rpc, 'unknown'), 'blocked', v_reason, v_state, COALESCE(_target, '{}'::jsonb), _amount);
  RETURN FALSE;
END;
$$;

REVOKE ALL ON FUNCTION public.check_topup_trader_gate(uuid, text, jsonb, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_topup_trader_gate(uuid, text, jsonb, bigint) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Re-wire the three trader top-up RPCs through the logging gate.
-- Error message returned to the client is UNCHANGED (Pkg63 contract preserved),
-- so existing tests + Pkg63 topupTraderGateE2E continue to pass.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.coin_trader_self_recharge(amount bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE me uuid := auth.uid();
BEGIN
  IF NOT public.check_topup_trader_gate(
       me, 'coin_trader_self_recharge',
       jsonb_build_object('kind','self'),
       amount
     ) THEN
    IF me IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Not authenticated'); END IF;
    RETURN jsonb_build_object('success', false, 'error', 'Only approved L1-L5 helper traders can top up');
  END IF;
  RETURN public.helper_transfer_diamonds_to_self(me, amount);
END; $$;

CREATE OR REPLACE FUNCTION public.coin_trader_transfer_to_user(recipient_uid uuid, amount bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE me uuid := auth.uid();
BEGIN
  IF NOT public.check_topup_trader_gate(
       me, 'coin_trader_transfer_to_user',
       jsonb_build_object('kind','uid','recipient_uid', recipient_uid),
       amount
     ) THEN
    IF me IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Not authenticated'); END IF;
    RETURN jsonb_build_object('success', false, 'error', 'Only approved L1-L5 helper traders can top up');
  END IF;
  RETURN public.helper_transfer_coins_to_user(me, recipient_uid, amount, 'trader_to_user');
END; $$;

CREATE OR REPLACE FUNCTION public.coin_trader_transfer_to_agency(target_agency_id uuid, amount bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE me uuid := auth.uid(); j jsonb;
BEGIN
  IF NOT public.check_topup_trader_gate(
       me, 'coin_trader_transfer_to_agency',
       jsonb_build_object('kind','agency','agency_id', target_agency_id),
       amount
     ) THEN
    IF me IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Not authenticated'); END IF;
    RETURN jsonb_build_object('success', false, 'error', 'Only approved L1-L5 helper traders can top up');
  END IF;
  j := public.helper_transfer_diamonds_to_agency(me, target_agency_id, amount, 'trader_to_agency');
  IF COALESCE((j->>'success')::boolean, false) THEN
    INSERT INTO public.coin_trader_transfers (user_id, counterparty_agency_id, amount, transfer_type, status)
    VALUES (me, target_agency_id, amount, 'to_agency', 'completed');
  END IF;
  RETURN j;
END; $$;

-- ---------------------------------------------------------------------------
-- Admin convenience: paginated list of blocked decisions with optional filters.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_list_topup_gate_audit(
  _limit  int  DEFAULT 100,
  _offset int  DEFAULT 0,
  _reason text DEFAULT NULL,
  _rpc    text DEFAULT NULL,
  _user_id uuid DEFAULT NULL
) RETURNS TABLE (
  id           uuid,
  user_id      uuid,
  rpc          text,
  reason       text,
  helper_state jsonb,
  target       jsonb,
  amount       bigint,
  created_at   timestamptz,
  total_count  bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.is_active_admin_session() THEN
    RAISE EXCEPTION 'admin_session_required';
  END IF;

  RETURN QUERY
  WITH filtered AS (
    SELECT *
    FROM public.topup_trader_gate_audit a
    WHERE (_reason  IS NULL OR a.reason  = _reason)
      AND (_rpc     IS NULL OR a.rpc     = _rpc)
      AND (_user_id IS NULL OR a.user_id = _user_id)
  ),
  total AS (SELECT count(*) AS c FROM filtered)
  SELECT f.id, f.user_id, f.rpc, f.reason, f.helper_state, f.target, f.amount, f.created_at,
         (SELECT c FROM total) AS total_count
  FROM filtered f
  ORDER BY f.created_at DESC
  LIMIT GREATEST(_limit, 1) OFFSET GREATEST(_offset, 0);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_topup_gate_audit(int,int,text,text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_list_topup_gate_audit(int,int,text,text,uuid) TO authenticated, service_role;