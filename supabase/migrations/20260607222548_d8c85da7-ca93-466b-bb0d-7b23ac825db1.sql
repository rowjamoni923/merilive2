-- 1) Tracking table for dedupe
CREATE TABLE IF NOT EXISTS public.app_update_broadcast_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  version_code TEXT NOT NULL,
  version_name TEXT,
  platform TEXT NOT NULL DEFAULT 'android',
  devices_targeted INTEGER NOT NULL DEFAULT 0,
  devices_delivered INTEGER NOT NULL DEFAULT 0,
  broadcast_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (platform, version_code)
);

GRANT SELECT ON public.app_update_broadcast_log TO authenticated;
GRANT ALL ON public.app_update_broadcast_log TO service_role;

ALTER TABLE public.app_update_broadcast_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read broadcast log"
  ON public.app_update_broadcast_log
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_users au
      WHERE au.id = auth.uid() AND au.is_active = true
    )
  );

CREATE POLICY "Service role full access"
  ON public.app_update_broadcast_log
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 2) Trigger function: fire broadcast-app-update edge function on version bump
CREATE OR REPLACE FUNCTION public.trigger_broadcast_app_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_url text := 'https://ayjdlvuurscxucatbbah.supabase.co/functions/v1/broadcast-app-update';
  v_old_code int := COALESCE(OLD.current_version_code, 0);
  v_new_code int := COALESCE(NEW.current_version_code, 0);
BEGIN
  -- Only fire when version_code actually increases (new release published).
  -- Ignore maintenance toggles, message edits, etc.
  IF v_new_code <= v_old_code THEN
    RETURN NEW;
  END IF;

  -- Fire-and-forget HTTP call to the edge function. The edge function will
  -- verify this version row, dedupe, and broadcast to all active devices.
  PERFORM net.http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := jsonb_build_object(
      'versionSettingsId', NEW.id::text,
      'platform', NEW.platform
    )
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'trigger_broadcast_app_update failed: %', SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_broadcast_app_update ON public.app_version_settings;
CREATE TRIGGER trg_broadcast_app_update
  AFTER UPDATE ON public.app_version_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_broadcast_app_update();

-- Also fire on INSERT (first-time platform row).
DROP TRIGGER IF EXISTS trg_broadcast_app_update_insert ON public.app_version_settings;
CREATE TRIGGER trg_broadcast_app_update_insert
  AFTER INSERT ON public.app_version_settings
  FOR EACH ROW
  WHEN (NEW.current_version_code IS NOT NULL AND NEW.current_version_code > 0)
  EXECUTE FUNCTION public.trigger_broadcast_app_update();