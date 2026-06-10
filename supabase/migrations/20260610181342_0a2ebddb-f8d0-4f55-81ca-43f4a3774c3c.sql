
-- C4: Call balance escrow infrastructure (additive only — no existing RPC changes)

CREATE TABLE IF NOT EXISTS public.call_balance_reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  caller_id UUID NOT NULL,
  host_id UUID NOT NULL,
  reserved_coins INTEGER NOT NULL CHECK (reserved_coins > 0),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','released','consumed','expired')),
  call_id UUID,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '5 minutes'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  released_at TIMESTAMPTZ,
  consumed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_call_balance_reservations_caller_active
  ON public.call_balance_reservations(caller_id)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_call_balance_reservations_expires_active
  ON public.call_balance_reservations(expires_at)
  WHERE status = 'active';

-- Grants — caller is read-only (no client INSERT/UPDATE; only via SECURITY DEFINER RPCs)
GRANT SELECT ON public.call_balance_reservations TO authenticated;
GRANT ALL ON public.call_balance_reservations TO service_role;

ALTER TABLE public.call_balance_reservations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own active reservations"
  ON public.call_balance_reservations FOR SELECT
  TO authenticated
  USING (caller_id = auth.uid() OR host_id = auth.uid());

CREATE POLICY "Service role full access"
  ON public.call_balance_reservations FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- View: net available coins (coins minus active reservations) per user
CREATE OR REPLACE VIEW public.v_user_reserved_coins AS
SELECT
  caller_id AS user_id,
  COALESCE(SUM(reserved_coins), 0)::BIGINT AS total_reserved
FROM public.call_balance_reservations
WHERE status = 'active' AND expires_at > now()
GROUP BY caller_id;

GRANT SELECT ON public.v_user_reserved_coins TO authenticated, service_role;

-- RPC: reserve_call_balance
CREATE OR REPLACE FUNCTION public.reserve_call_balance(
  p_caller_id UUID,
  p_host_id UUID,
  p_estimated_coins INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_coins BIGINT;
  v_already_reserved BIGINT;
  v_available BIGINT;
  v_hold_id UUID;
BEGIN
  IF p_caller_id IS NULL OR p_host_id IS NULL OR p_estimated_coins <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_input');
  END IF;
  IF p_caller_id = p_host_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'cannot_reserve_self');
  END IF;

  -- Lock the caller's profile row to serialize concurrent reserve attempts
  SELECT COALESCE(coins, 0) INTO v_caller_coins
  FROM public.profiles
  WHERE id = p_caller_id
  FOR UPDATE;

  IF v_caller_coins IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'caller_not_found');
  END IF;

  SELECT COALESCE(SUM(reserved_coins), 0) INTO v_already_reserved
  FROM public.call_balance_reservations
  WHERE caller_id = p_caller_id AND status = 'active' AND expires_at > now();

  v_available := v_caller_coins - v_already_reserved;

  IF v_available < p_estimated_coins THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'insufficient_balance',
      'available', v_available,
      'required', p_estimated_coins
    );
  END IF;

  INSERT INTO public.call_balance_reservations(caller_id, host_id, reserved_coins)
  VALUES (p_caller_id, p_host_id, p_estimated_coins)
  RETURNING id INTO v_hold_id;

  RETURN jsonb_build_object('success', true, 'hold_id', v_hold_id, 'reserved', p_estimated_coins);
END;
$$;

GRANT EXECUTE ON FUNCTION public.reserve_call_balance(UUID, UUID, INTEGER) TO authenticated, service_role;

-- RPC: release_call_balance
CREATE OR REPLACE FUNCTION public.release_call_balance(p_hold_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated INTEGER;
BEGIN
  IF p_hold_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_hold');
  END IF;

  UPDATE public.call_balance_reservations
  SET status = 'released', released_at = now()
  WHERE id = p_hold_id AND status = 'active';

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  IF v_updated = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'hold_not_active');
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.release_call_balance(UUID) TO authenticated, service_role;

-- RPC: consume_call_balance_reservation (call accepted; billing takes over)
CREATE OR REPLACE FUNCTION public.consume_call_balance_reservation(p_hold_id UUID, p_call_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated INTEGER;
BEGIN
  IF p_hold_id IS NULL OR p_call_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_input');
  END IF;

  UPDATE public.call_balance_reservations
  SET status = 'consumed', consumed_at = now(), call_id = p_call_id
  WHERE id = p_hold_id AND status = 'active';

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  IF v_updated = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'hold_not_active');
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.consume_call_balance_reservation(UUID, UUID) TO authenticated, service_role;

-- RPC: cleanup_expired_call_reservations (callable by cron)
CREATE OR REPLACE FUNCTION public.cleanup_expired_call_reservations()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  UPDATE public.call_balance_reservations
  SET status = 'expired'
  WHERE status = 'active' AND expires_at < now();
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cleanup_expired_call_reservations() TO service_role;
