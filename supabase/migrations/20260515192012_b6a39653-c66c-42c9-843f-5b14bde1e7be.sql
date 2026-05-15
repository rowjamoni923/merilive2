
-- 1. Server-side throttle: coalesce bumps to the same topic within 500ms into one event
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
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_row_id := COALESCE((to_jsonb(OLD)->>'id'), (to_jsonb(OLD)->>'setting_key'), '');
  ELSE
    v_row_id := COALESCE((to_jsonb(NEW)->>'id'), (to_jsonb(NEW)->>'setting_key'), '');
  END IF;

  -- Throttle: if same topic was bumped <500ms ago, just bump the counter without
  -- updating updated_at (keeps event count low; Realtime fires on any column change
  -- but if updated_at stays the same, REPLICA emits one row only on the next 500ms
  -- bucket). We still write so version increments — but we coalesce updated_at.
  SELECT updated_at INTO v_last_at FROM public.admin_broadcast WHERE topic = v_topic;

  IF v_last_at IS NOT NULL AND (now() - v_last_at) < interval '500 milliseconds' THEN
    UPDATE public.admin_broadcast
       SET version = version + 1,
           last_event = TG_OP,
           last_row_id = v_row_id
           -- updated_at intentionally NOT changed to coalesce burst
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

-- 2. Kill switch setting (default ON). Owner can flip OFF from admin panel.
INSERT INTO public.app_settings (setting_key, setting_value, description)
VALUES (
  'realtime_admin_broadcast_enabled',
  'true'::text,
  'Master switch for the admin → app instant sync (Pkg37). Turn OFF to stop all admin_broadcast realtime push if costs spike.'
)
ON CONFLICT (setting_key) DO NOTHING;
