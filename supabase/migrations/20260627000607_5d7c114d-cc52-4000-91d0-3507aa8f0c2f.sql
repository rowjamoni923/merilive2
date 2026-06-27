
-- ────────────────────────────────────────────────────────────────────────────
-- 1) Stale device-token sweep helper
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.cleanup_stale_device_tokens()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE public.device_tokens
     SET is_active = false
   WHERE is_active = true
     AND COALESCE(updated_at, created_at) < now() - interval '30 days';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_stale_device_tokens() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cleanup_stale_device_tokens() TO service_role;

-- One-shot prune now to clean any pre-existing backlog.
SELECT public.cleanup_stale_device_tokens();

-- ────────────────────────────────────────────────────────────────────────────
-- 2) Server-authoritative private-call delivery
--    Trigger fires call-deliver via pg_net the instant a ringing call is
--    inserted, with x-internal-secret header. Idempotent via call_delivery_log.
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.tg_private_call_autoring()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_url       text := 'https://ayjdlvuurscxucatbbah.supabase.co/functions/v1/call-deliver';
  v_secret    text;
  v_anon      text;
  v_already   boolean;
  v_status    text;
BEGIN
  v_status := lower(coalesce(NEW.status, ''));
  IF v_status NOT IN ('ringing','pending') THEN
    RETURN NEW;
  END IF;
  IF NEW.caller_id IS NULL OR NEW.host_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Idempotency: skip if any delivery attempt already logged for this call.
  SELECT EXISTS (
    SELECT 1 FROM public.call_delivery_log
     WHERE call_id = NEW.id
       AND channel IN ('fcm','notification_insert')
  ) INTO v_already;
  IF v_already THEN
    RETURN NEW;
  END IF;

  BEGIN
    SELECT decrypted_secret INTO v_secret
      FROM vault.decrypted_secrets WHERE name = 'CRON_SECRET' LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    v_secret := NULL;
  END;

  BEGIN
    SELECT decrypted_secret INTO v_anon
      FROM vault.decrypted_secrets WHERE name = 'SUPABASE_ANON_KEY' LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    v_anon := NULL;
  END;

  -- Fire-and-forget; failure must never block call row insert.
  BEGIN
    PERFORM net.http_post(
      url     := v_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-internal-secret', COALESCE(v_secret, ''),
        'apikey', COALESCE(v_anon, '')
      ),
      body    := jsonb_build_object(
        'callId',   NEW.id,
        'callerId', NEW.caller_id,
        'calleeId', NEW.host_id,
        'callType', COALESCE(NEW.call_type, 'video')
      ),
      timeout_milliseconds := 5000
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'tg_private_call_autoring net.http_post failed: %', SQLERRM;
  END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_private_call_autoring ON public.private_calls;
CREATE TRIGGER trg_private_call_autoring
AFTER INSERT ON public.private_calls
FOR EACH ROW EXECUTE FUNCTION public.tg_private_call_autoring();
