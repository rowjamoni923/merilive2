
-- Pkg53: hard server-side cap on admin_broadcast events per hour.
-- If exceeded, auto-flip realtime_admin_broadcast_enabled to false.
-- Owner can re-enable from /admin/realtime-controls.

INSERT INTO public.app_settings (setting_key, setting_value, description)
VALUES (
  'realtime_admin_broadcast_hourly_cap',
  '50000'::text,
  'Pkg53 cost guard. Max admin_broadcast trigger fires per hour. If exceeded, kill switch auto-flips OFF.'
)
ON CONFLICT (setting_key) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.admin_broadcast_rate_counter (
  bucket_hour timestamptz PRIMARY KEY,
  event_count bigint NOT NULL DEFAULT 0
);
ALTER TABLE public.admin_broadcast_rate_counter ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin session full access" ON public.admin_broadcast_rate_counter;
CREATE POLICY "Admin session full access" ON public.admin_broadcast_rate_counter
  FOR ALL USING (public.is_active_admin_session()) WITH CHECK (public.is_active_admin_session());

-- Wrap bump function with the cap. Idempotent replace.
CREATE OR REPLACE FUNCTION public.tg_admin_broadcast_bump()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_topic text := COALESCE(TG_ARGV[0], TG_TABLE_NAME);
  v_row_id text;
  v_last_at timestamptz;
  v_bucket timestamptz := date_trunc('hour', now());
  v_count bigint;
  v_cap bigint;
  v_enabled text;
BEGIN
  -- Kill switch (fast path — single setting read, no realtime cost when OFF).
  SELECT setting_value INTO v_enabled
    FROM public.app_settings
   WHERE setting_key = 'realtime_admin_broadcast_enabled';
  IF v_enabled IS NOT NULL AND v_enabled <> 'true' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Hourly cap (defense-in-depth — prevents runaway cost from buggy trigger).
  INSERT INTO public.admin_broadcast_rate_counter (bucket_hour, event_count)
  VALUES (v_bucket, 1)
  ON CONFLICT (bucket_hour) DO UPDATE
    SET event_count = admin_broadcast_rate_counter.event_count + 1
  RETURNING event_count INTO v_count;

  SELECT COALESCE(NULLIF(setting_value, '')::bigint, 50000) INTO v_cap
    FROM public.app_settings
   WHERE setting_key = 'realtime_admin_broadcast_hourly_cap';

  IF v_count > COALESCE(v_cap, 50000) THEN
    -- Auto-disable to stop bleeding. Owner must re-enable manually.
    UPDATE public.app_settings
       SET setting_value = 'false'
     WHERE setting_key = 'realtime_admin_broadcast_enabled';
    RAISE WARNING 'Pkg53: admin_broadcast hourly cap exceeded (% events); kill switch auto-disabled', v_count;
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP = 'DELETE' THEN
    v_row_id := COALESCE((to_jsonb(OLD)->>'id'), (to_jsonb(OLD)->>'setting_key'), '');
  ELSE
    v_row_id := COALESCE((to_jsonb(NEW)->>'id'), (to_jsonb(NEW)->>'setting_key'), '');
  END IF;

  SELECT updated_at INTO v_last_at FROM public.admin_broadcast WHERE topic = v_topic;

  IF v_last_at IS NOT NULL AND (now() - v_last_at) < interval '500 milliseconds' THEN
    UPDATE public.admin_broadcast
       SET version = version + 1,
           last_event = TG_OP,
           last_row_id = v_row_id
     WHERE topic = v_topic;
  ELSE
    INSERT INTO public.admin_broadcast (topic, version, last_event, last_row_id, updated_at)
    VALUES (v_topic, 1, TG_OP, v_row_id, now())
    ON CONFLICT (topic) DO UPDATE
      SET version = admin_broadcast.version + 1,
          last_event = EXCLUDED.last_event,
          last_row_id = EXCLUDED.last_row_id,
          updated_at = now();
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$function$;

-- Housekeeping: prune counter rows older than 48h (keeps table tiny).
CREATE OR REPLACE FUNCTION public.cleanup_admin_broadcast_rate_counter()
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  DELETE FROM public.admin_broadcast_rate_counter WHERE bucket_hour < now() - interval '48 hours';
$$;
