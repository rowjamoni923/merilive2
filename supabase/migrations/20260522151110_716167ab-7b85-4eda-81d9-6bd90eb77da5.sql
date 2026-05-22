-- Pkg129: Auto-record on room start

-- 1. Host preference flag
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS auto_record_live boolean NOT NULL DEFAULT false;

-- 2. Analytics marker on stream_recordings (auto vs manual)
ALTER TABLE public.stream_recordings
  ADD COLUMN IF NOT EXISTS auto_started boolean NOT NULL DEFAULT false;

-- 3. Kill-switch + shared secret in app_settings
DO $$
DECLARE
  current_val jsonb;
  has_secret boolean;
BEGIN
  -- a) Add auto_record to livekit_signaling_enabled (idempotent)
  SELECT
    CASE
      WHEN setting_value IS NULL OR setting_value = '' THEN '{}'::jsonb
      ELSE setting_value::jsonb
    END
  INTO current_val
  FROM public.app_settings
  WHERE setting_key = 'livekit_signaling_enabled';

  IF current_val IS NULL THEN
    INSERT INTO public.app_settings (setting_key, setting_value)
    VALUES ('livekit_signaling_enabled', jsonb_build_object('auto_record', false)::text);
  ELSIF NOT (current_val ? 'auto_record') THEN
    UPDATE public.app_settings
    SET setting_value = (current_val || jsonb_build_object('auto_record', false))::text
    WHERE setting_key = 'livekit_signaling_enabled';
  END IF;

  -- b) Seed auto_record_secret with random 32-byte hex if absent
  SELECT EXISTS(
    SELECT 1 FROM public.app_settings WHERE setting_key = 'auto_record_secret'
  ) INTO has_secret;

  IF NOT has_secret THEN
    INSERT INTO public.app_settings (setting_key, setting_value)
    VALUES ('auto_record_secret', encode(gen_random_bytes(32), 'hex'));
  END IF;
END $$;

-- 4. Trigger function: on new active live_streams row, fire-and-forget
--    POST to the livekit-auto-record edge function if host opted in.
--    pg_net is async — never blocks the INSERT.
CREATE OR REPLACE FUNCTION public.tg_auto_record_on_stream_start()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  host_opt boolean;
  secret_value text;
  fn_url text;
BEGIN
  -- Only fire on active inserts that don't already have an egress.
  IF NEW.is_active IS NOT TRUE OR NEW.egress_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Cheap precheck: host preference must be ON. Cuts pg_net work for opt-outs.
  SELECT auto_record_live INTO host_opt
  FROM public.profiles
  WHERE id = NEW.host_id;

  IF host_opt IS NOT TRUE THEN
    RETURN NEW;
  END IF;

  SELECT setting_value INTO secret_value
  FROM public.app_settings
  WHERE setting_key = 'auto_record_secret';

  IF secret_value IS NULL OR length(secret_value) = 0 THEN
    RAISE WARNING '[Pkg129] auto_record_secret missing — skipping auto-record for stream %', NEW.id;
    RETURN NEW;
  END IF;

  -- Hardcoded project URL (matches Pkg32 push pattern — memory: "Push
  -- notifications fixed (Pkg32): hardcoded edge function URL").
  fn_url := 'https://ayjdlvuurscxucatbbah.supabase.co/functions/v1/livekit-auto-record';

  BEGIN
    PERFORM net.http_post(
      url := fn_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-auto-record-secret', secret_value
      ),
      body := jsonb_build_object('streamId', NEW.id)
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '[Pkg129] pg_net post failed for stream %: %', NEW.id, SQLERRM;
  END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_record_on_stream_start ON public.live_streams;
CREATE TRIGGER trg_auto_record_on_stream_start
  AFTER INSERT ON public.live_streams
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_auto_record_on_stream_start();
