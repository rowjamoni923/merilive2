
-- G4: Anti-self-gift fingerprint signals (Lovable-only, conservative)
-- G5: Chargeback hold for new-sender gifts (7-day hold)

-- ============================================================
-- G4: gift fraud / self-gift detection
-- ============================================================
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS device_fingerprints jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE TABLE IF NOT EXISTS public.gift_self_link_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id uuid NOT NULL,
  receiver_id uuid NOT NULL,
  device_id text,
  ip_hash text,
  gift_count integer NOT NULL DEFAULT 0,
  coin_total bigint NOT NULL DEFAULT 0,
  first_at timestamptz NOT NULL DEFAULT now(),
  last_at timestamptz NOT NULL DEFAULT now(),
  suspect boolean NOT NULL DEFAULT false,
  suspect_reason text,
  UNIQUE (sender_id, receiver_id, device_id)
);

GRANT SELECT ON public.gift_self_link_signals TO authenticated;
GRANT ALL ON public.gift_self_link_signals TO service_role;
ALTER TABLE public.gift_self_link_signals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "self read own signals" ON public.gift_self_link_signals
  FOR SELECT TO authenticated
  USING (sender_id = auth.uid() OR receiver_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_gsl_pair ON public.gift_self_link_signals(sender_id, receiver_id);
CREATE INDEX IF NOT EXISTS idx_gsl_device ON public.gift_self_link_signals(device_id) WHERE device_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_gsl_suspect ON public.gift_self_link_signals(suspect) WHERE suspect = true;

-- Append device_id to caller profile fingerprints (dedup)
CREATE OR REPLACE FUNCTION public.register_device_fingerprint(_device_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL OR _device_id IS NULL OR length(_device_id) < 8 THEN
    RETURN;
  END IF;
  UPDATE public.profiles
  SET device_fingerprints = (
    SELECT jsonb_agg(DISTINCT v)
    FROM jsonb_array_elements_text(
      COALESCE(device_fingerprints, '[]'::jsonb) || to_jsonb(_device_id)
    ) AS v
  )
  WHERE id = _uid;
END;
$$;

-- Record + score a gift signal. Returns suspect flag.
CREATE OR REPLACE FUNCTION public.record_gift_signal(
  _sender_id uuid,
  _receiver_id uuid,
  _device_id text,
  _ip_hash text,
  _coins bigint
) RETURNS TABLE(suspect boolean, reason text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _shared_device boolean := false;
  _row public.gift_self_link_signals%ROWTYPE;
BEGIN
  IF _sender_id = _receiver_id THEN
    RETURN QUERY SELECT true, 'same_user'::text;
    RETURN;
  END IF;

  -- Check device fingerprint overlap between accounts
  IF _device_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.profiles s, public.profiles r
      WHERE s.id = _sender_id AND r.id = _receiver_id
        AND s.device_fingerprints ? _device_id
        AND r.device_fingerprints ? _device_id
    ) INTO _shared_device;
  END IF;

  INSERT INTO public.gift_self_link_signals
    (sender_id, receiver_id, device_id, ip_hash, gift_count, coin_total, suspect, suspect_reason)
  VALUES
    (_sender_id, _receiver_id, COALESCE(_device_id, ''), _ip_hash, 1, COALESCE(_coins,0),
     _shared_device, CASE WHEN _shared_device THEN 'shared_device' ELSE NULL END)
  ON CONFLICT (sender_id, receiver_id, device_id) DO UPDATE
    SET gift_count = public.gift_self_link_signals.gift_count + 1,
        coin_total = public.gift_self_link_signals.coin_total + COALESCE(_coins,0),
        last_at = now(),
        suspect = public.gift_self_link_signals.suspect OR _shared_device,
        suspect_reason = COALESCE(public.gift_self_link_signals.suspect_reason,
          CASE WHEN _shared_device THEN 'shared_device' END);

  RETURN QUERY SELECT _shared_device, CASE WHEN _shared_device THEN 'shared_device' ELSE NULL END;
END;
$$;

REVOKE ALL ON FUNCTION public.register_device_fingerprint(text) FROM public;
GRANT EXECUTE ON FUNCTION public.register_device_fingerprint(text) TO authenticated;
REVOKE ALL ON FUNCTION public.record_gift_signal(uuid,uuid,text,text,bigint) FROM public;
GRANT EXECUTE ON FUNCTION public.record_gift_signal(uuid,uuid,text,text,bigint) TO service_role;

-- ============================================================
-- G5: Chargeback hold (7 days for new-sender earnings)
-- ============================================================
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS first_recharge_at timestamptz,
  ADD COLUMN IF NOT EXISTS held_earnings bigint NOT NULL DEFAULT 0;

ALTER TABLE public.gift_transactions
  ADD COLUMN IF NOT EXISTS held_until timestamptz,
  ADD COLUMN IF NOT EXISTS held_beans bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS held_released boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_gt_held_until
  ON public.gift_transactions(held_until)
  WHERE held_until IS NOT NULL AND held_released = false;

-- Backfill first_recharge_at from existing recharge data (idempotent)
UPDATE public.profiles p
SET first_recharge_at = sub.first_at
FROM (
  SELECT user_id, MIN(created_at) AS first_at
  FROM public.recharge_transactions
  WHERE status = 'completed'
  GROUP BY user_id
) sub
WHERE p.id = sub.user_id AND p.first_recharge_at IS NULL;

-- Stamp first_recharge_at on first successful recharge
CREATE OR REPLACE FUNCTION public.stamp_first_recharge()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'completed' AND (OLD.status IS DISTINCT FROM 'completed') THEN
    UPDATE public.profiles
    SET first_recharge_at = LEAST(COALESCE(first_recharge_at, NEW.created_at), NEW.created_at)
    WHERE id = NEW.user_id AND (first_recharge_at IS NULL OR first_recharge_at > NEW.created_at);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_stamp_first_recharge ON public.recharge_transactions;
CREATE TRIGGER trg_stamp_first_recharge
  AFTER INSERT OR UPDATE OF status ON public.recharge_transactions
  FOR EACH ROW EXECUTE FUNCTION public.stamp_first_recharge();

-- Apply chargeback hold on new gifts when sender's first_recharge_at < 30d ago
CREATE OR REPLACE FUNCTION public.apply_gift_chargeback_hold()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _first_rc timestamptz;
  _hold_days int := 7;
  _new_sender_window int := 30;
BEGIN
  IF NEW.receiver_beans IS NULL OR NEW.receiver_beans <= 0 THEN
    RETURN NEW;
  END IF;
  SELECT first_recharge_at INTO _first_rc FROM public.profiles WHERE id = NEW.sender_id;
  IF _first_rc IS NOT NULL AND _first_rc > now() - (_new_sender_window || ' days')::interval THEN
    NEW.held_until := now() + (_hold_days || ' days')::interval;
    NEW.held_beans := NEW.receiver_beans;
    -- Move beans from receiver pending_earnings into held_earnings
    UPDATE public.profiles
    SET held_earnings = COALESCE(held_earnings, 0) + NEW.receiver_beans,
        pending_earnings = GREATEST(COALESCE(pending_earnings, 0) - NEW.receiver_beans, 0)
    WHERE id = NEW.receiver_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_apply_gift_chargeback_hold ON public.gift_transactions;
CREATE TRIGGER trg_apply_gift_chargeback_hold
  BEFORE INSERT ON public.gift_transactions
  FOR EACH ROW EXECUTE FUNCTION public.apply_gift_chargeback_hold();

-- Release expired holds (cron-driven)
CREATE OR REPLACE FUNCTION public.release_expired_gift_holds()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row record;
  _count int := 0;
BEGIN
  FOR _row IN
    SELECT id, receiver_id, held_beans
    FROM public.gift_transactions
    WHERE held_released = false
      AND held_until IS NOT NULL
      AND held_until <= now()
    LIMIT 1000
  LOOP
    UPDATE public.profiles
    SET held_earnings = GREATEST(COALESCE(held_earnings,0) - _row.held_beans, 0),
        pending_earnings = COALESCE(pending_earnings,0) + _row.held_beans,
        total_earnings = COALESCE(total_earnings,0) + _row.held_beans
    WHERE id = _row.receiver_id;
    UPDATE public.gift_transactions SET held_released = true WHERE id = _row.id;
    _count := _count + 1;
  END LOOP;
  RETURN _count;
END;
$$;

REVOKE ALL ON FUNCTION public.release_expired_gift_holds() FROM public;
GRANT EXECUTE ON FUNCTION public.release_expired_gift_holds() TO service_role;

-- Schedule cron release every 10 minutes
SELECT cron.unschedule('release-expired-gift-holds') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'release-expired-gift-holds'
);
SELECT cron.schedule(
  'release-expired-gift-holds',
  '*/10 * * * *',
  $cron$ SELECT public.release_expired_gift_holds(); $cron$
);
