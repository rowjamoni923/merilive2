-- ============================================================
-- R2-Phase B Wave-1: secure device-session exchange + idempotency
-- ============================================================

-- 1) device_session_exchange_tokens: single-use, 5-min TTL, service-role only
CREATE TABLE IF NOT EXISTS public.device_session_exchange_tokens (
  token uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  device_id text NOT NULL,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '5 minutes'),
  consumed_at timestamptz,
  consumer_ip text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dset_user ON public.device_session_exchange_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_dset_expires ON public.device_session_exchange_tokens(expires_at) WHERE consumed_at IS NULL;

-- service_role only — no anon, no authenticated. Tokens are minted by SECURITY DEFINER RPC
-- and consumed by service-role edge function. End users must never read this table.
GRANT ALL ON public.device_session_exchange_tokens TO service_role;
REVOKE ALL ON public.device_session_exchange_tokens FROM anon, authenticated, PUBLIC;

ALTER TABLE public.device_session_exchange_tokens ENABLE ROW LEVEL SECURITY;
-- Hard deny: only service_role bypasses RLS; no policy for other roles = no access.
CREATE POLICY "service_role_only_dset" ON public.device_session_exchange_tokens
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 2) idempotency_keys: shared scope+key store, 24h TTL
CREATE TABLE IF NOT EXISTS public.idempotency_keys (
  scope text NOT NULL,
  key text NOT NULL,
  user_id uuid,
  status text NOT NULL DEFAULT 'in_flight' CHECK (status IN ('in_flight','succeeded','failed')),
  response jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  PRIMARY KEY (scope, key)
);

CREATE INDEX IF NOT EXISTS idx_idem_expires ON public.idempotency_keys(expires_at);
CREATE INDEX IF NOT EXISTS idx_idem_user ON public.idempotency_keys(user_id, scope);

GRANT ALL ON public.idempotency_keys TO service_role;
REVOKE ALL ON public.idempotency_keys FROM anon, authenticated, PUBLIC;

ALTER TABLE public.idempotency_keys ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_only_idem" ON public.idempotency_keys
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 3) Helper RPCs for idempotency

-- Claim a key: returns 'fresh' if first caller, 'duplicate_in_flight' if a sibling is processing,
-- or 'duplicate_done' with the cached response if already completed.
CREATE OR REPLACE FUNCTION public.claim_idempotency_key(
  _scope text,
  _key text,
  _user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.idempotency_keys%ROWTYPE;
BEGIN
  IF _scope IS NULL OR _key IS NULL OR char_length(_key) < 8 OR char_length(_key) > 128 THEN
    RAISE EXCEPTION 'invalid_idempotency_key';
  END IF;

  -- Cleanup expired rows opportunistically (cheap)
  DELETE FROM public.idempotency_keys WHERE expires_at < now();

  BEGIN
    INSERT INTO public.idempotency_keys(scope, key, user_id, status)
    VALUES (_scope, _key, _user_id, 'in_flight');
    RETURN jsonb_build_object('status', 'fresh');
  EXCEPTION WHEN unique_violation THEN
    SELECT * INTO v_row FROM public.idempotency_keys
      WHERE scope = _scope AND key = _key FOR UPDATE;
    IF v_row.status = 'succeeded' OR v_row.status = 'failed' THEN
      RETURN jsonb_build_object('status', 'duplicate_done', 'response', v_row.response, 'final_status', v_row.status);
    END IF;
    RETURN jsonb_build_object('status', 'duplicate_in_flight');
  END;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_idempotency_key(text, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_idempotency_key(text, text, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.complete_idempotency_key(
  _scope text,
  _key text,
  _status text,
  _response jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _status NOT IN ('succeeded','failed') THEN
    RAISE EXCEPTION 'invalid_status';
  END IF;
  UPDATE public.idempotency_keys
    SET status = _status,
        response = _response,
        completed_at = now()
    WHERE scope = _scope AND key = _key;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_idempotency_key(text, text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_idempotency_key(text, text, text, jsonb) TO service_role;

-- 4) recover_session_by_device — REMOVE password leak.
-- Returns metadata + a one-time exchange token. The edge function
-- `device-session-exchange` consumes the token and mints a session
-- via Supabase admin API. The deterministic password is no longer
-- returned to the browser, closing R2-C4.
DROP FUNCTION IF EXISTS public.recover_session_by_device(text);

CREATE OR REPLACE FUNCTION public.recover_session_by_device(p_device_id text)
RETURNS TABLE(
  user_id uuid,
  display_name text,
  avatar_url text,
  gender text,
  is_host boolean,
  exchange_token uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_device_id text := left(coalesce(p_device_id, ''), 160);
  v_user_id uuid;
  v_display_name text;
  v_avatar_url text;
  v_gender text;
  v_is_host boolean;
  v_token uuid;
BEGIN
  IF v_device_id !~ '^device_[A-Za-z0-9_:-]{6,128}$' THEN
    RETURN;
  END IF;

  SELECT p.id, p.display_name, p.avatar_url, p.gender, COALESCE(p.is_host, false)
    INTO v_user_id, v_display_name, v_avatar_url, v_gender, v_is_host
    FROM public.profiles p
    WHERE p.device_id = v_device_id
      AND COALESCE(p.is_deleted, false) = false
      AND COALESCE(p.is_banned, false) = false
      AND COALESCE(p.is_blocked, false) = false
      AND NOT EXISTS (
        SELECT 1 FROM public.banned_devices bd
        WHERE bd.device_id = v_device_id
          AND COALESCE(bd.is_active, true) = true
      )
    ORDER BY p.created_at DESC NULLS LAST
    LIMIT 1;

  IF v_user_id IS NULL THEN
    RETURN;
  END IF;

  -- Rate-limit: at most 5 outstanding (non-consumed, non-expired) tokens per device
  PERFORM 1 FROM public.device_session_exchange_tokens
    WHERE device_id = v_device_id
      AND consumed_at IS NULL
      AND expires_at > now()
    HAVING count(*) >= 5;
  IF FOUND THEN
    RAISE EXCEPTION 'too_many_pending_exchanges';
  END IF;

  -- Mint a fresh single-use token
  INSERT INTO public.device_session_exchange_tokens(user_id, device_id)
    VALUES (v_user_id, v_device_id)
    RETURNING token INTO v_token;

  RETURN QUERY SELECT
    v_user_id,
    v_display_name,
    v_avatar_url,
    v_gender,
    v_is_host,
    v_token;
END;
$$;

REVOKE ALL ON FUNCTION public.recover_session_by_device(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.recover_session_by_device(text) TO anon, authenticated;

-- Consume-token helper (service_role only)
CREATE OR REPLACE FUNCTION public.consume_device_session_token(
  p_token uuid,
  p_device_id text,
  p_consumer_ip text
)
RETURNS TABLE(user_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.device_session_exchange_tokens%ROWTYPE;
BEGIN
  SELECT * INTO v_row
    FROM public.device_session_exchange_tokens
    WHERE token = p_token
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'token_not_found';
  END IF;
  IF v_row.consumed_at IS NOT NULL THEN
    RAISE EXCEPTION 'token_already_consumed';
  END IF;
  IF v_row.expires_at < now() THEN
    RAISE EXCEPTION 'token_expired';
  END IF;
  IF v_row.device_id IS DISTINCT FROM left(coalesce(p_device_id, ''), 160) THEN
    RAISE EXCEPTION 'token_device_mismatch';
  END IF;

  UPDATE public.device_session_exchange_tokens
    SET consumed_at = now(),
        consumer_ip = left(coalesce(p_consumer_ip, ''), 64)
    WHERE token = p_token;

  RETURN QUERY SELECT v_row.user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_device_session_token(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_device_session_token(uuid, text, text) TO service_role;