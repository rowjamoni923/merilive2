
-- ============================================================
-- Random Call Broadcast Model (Chamet-style fan-out)
-- ============================================================
-- A caller creates ONE broadcast row. Edge fn fans the ring out
-- to every eligible online verified host. First host to accept
-- atomically claims the broadcast (UPDATE ... WHERE status='pending')
-- and the actual random_call_sessions row is created at claim time.
-- Losers receive a 'taken' broadcast and dismiss instantly.

CREATE TABLE IF NOT EXISTS public.random_call_broadcasts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  caller_id uuid NOT NULL,
  caller_device_id text,
  livekit_room text NOT NULL,
  hold_amount bigint NOT NULL DEFAULT 0,
  free_trial_seconds integer NOT NULL DEFAULT 0,
  min_billable_seconds integer NOT NULL DEFAULT 40,
  host_split_pct numeric NOT NULL DEFAULT 0.7,
  default_host_rate integer NOT NULL DEFAULT 60,
  status text NOT NULL DEFAULT 'pending', -- pending | claimed | cancelled | expired
  claimed_by uuid,
  claimed_at timestamptz,
  session_id uuid,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '20 seconds'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS random_call_broadcasts_status_idx
  ON public.random_call_broadcasts (status, expires_at);
CREATE INDEX IF NOT EXISTS random_call_broadcasts_caller_idx
  ON public.random_call_broadcasts (caller_id, created_at DESC);

GRANT SELECT ON public.random_call_broadcasts TO authenticated;
GRANT ALL ON public.random_call_broadcasts TO service_role;

ALTER TABLE public.random_call_broadcasts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "caller can read own broadcasts"
  ON public.random_call_broadcasts FOR SELECT TO authenticated
  USING (caller_id = auth.uid() OR claimed_by = auth.uid());

CREATE POLICY "service role manages broadcasts"
  ON public.random_call_broadcasts FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ============================================================
-- Atomic claim: first host wins, others lose.
-- ============================================================
CREATE OR REPLACE FUNCTION public.claim_random_broadcast(
  p_broadcast_id uuid,
  p_host_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  b record;
  cd_until timestamptz;
  v_rate integer;
  v_session_id uuid;
  v_free_trial integer;
BEGIN
  -- Cooldown check (consecutive reject lockout)
  SELECT random_reject_cooldown_until INTO cd_until
  FROM host_match_stats WHERE host_id = p_host_id;
  IF cd_until IS NOT NULL AND cd_until > now() THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'cooldown', 'until', cd_until);
  END IF;

  -- Atomic claim
  UPDATE random_call_broadcasts
     SET status = 'claimed',
         claimed_by = p_host_id,
         claimed_at = now(),
         updated_at = now()
   WHERE id = p_broadcast_id
     AND status = 'pending'
     AND expires_at > now()
     AND caller_id <> p_host_id
  RETURNING * INTO b;

  IF b.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_taken');
  END IF;

  -- Host's rate
  SELECT coin_rate_per_min INTO v_rate
    FROM host_match_preferences WHERE host_id = p_host_id;
  v_rate := COALESCE(v_rate, b.default_host_rate);
  v_free_trial := b.free_trial_seconds;

  -- Create the actual session row
  INSERT INTO random_call_sessions (
    livekit_room, caller_id, host_id,
    coin_rate_per_min, free_trial_seconds, min_billable_seconds,
    host_split_pct, hold_amount, status, caller_device_id, accepted_at
  ) VALUES (
    b.livekit_room, b.caller_id, p_host_id,
    v_rate, v_free_trial, b.min_billable_seconds,
    b.host_split_pct, b.hold_amount, 'connecting', b.caller_device_id, now()
  ) RETURNING id INTO v_session_id;

  UPDATE random_call_broadcasts
     SET session_id = v_session_id
   WHERE id = p_broadcast_id;

  -- Reset host reject streak on accept
  UPDATE host_match_stats
     SET consecutive_random_rejects = 0,
         random_reject_cooldown_until = NULL,
         updated_at = now()
   WHERE host_id = p_host_id;

  RETURN jsonb_build_object(
    'ok', true,
    'session_id', v_session_id,
    'room', b.livekit_room,
    'caller_id', b.caller_id,
    'coin_rate_per_min', v_rate,
    'free_trial_seconds', v_free_trial,
    'min_billable_seconds', b.min_billable_seconds
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_random_broadcast(uuid, uuid) TO authenticated, service_role;

-- ============================================================
-- Online global host pool sampler (NO country filter, NO lang filter)
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_online_global_hosts(
  p_caller_id uuid,
  p_limit int DEFAULT 500
) RETURNS TABLE(host_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT a.host_id
    FROM host_match_availability a
    LEFT JOIN host_match_stats s ON s.host_id = a.host_id
    LEFT JOIN profiles p ON p.id = a.host_id
   WHERE a.is_available = true
     AND a.host_id <> p_caller_id
     AND (a.suspended_until IS NULL OR a.suspended_until < now())
     AND (a.match_suspend_until IS NULL OR a.match_suspend_until < now())
     AND (s.random_reject_cooldown_until IS NULL OR s.random_reject_cooldown_until < now())
     AND (s.is_queue_suppressed IS NULL OR s.is_queue_suppressed = false)
     AND a.last_active_at > now() - interval '90 seconds'
     AND COALESCE(p.is_host, true) = true
   ORDER BY a.last_active_at DESC
   LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION public.get_online_global_hosts(uuid, int) TO authenticated, service_role;
