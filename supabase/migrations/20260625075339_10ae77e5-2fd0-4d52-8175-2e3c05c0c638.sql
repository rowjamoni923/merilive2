
-- 1) Normalize face verification status on INSERT to 'under_review' instantly,
--    so admin panel sees newly submitted face verifications as "Under Review"
--    immediately rather than "Pending". Bucket still classifies as pending,
--    so the auto-finalize service continues to pick the row up.
CREATE OR REPLACE FUNCTION public.normalize_face_verification_submission_status()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF lower(trim(coalesce(NEW.status, ''))) IN ('', 'submitted', 'pending') THEN
      NEW.status := 'under_review';
    END IF;
  ELSE
    IF lower(trim(coalesce(NEW.status, ''))) = 'submitted' THEN
      NEW.status := 'under_review';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

-- 2) When the admin_broadcast bump trigger collapses events inside the 500ms
--    throttle window, preserve INSERT semantics. Without this, an INSERT
--    immediately followed by an UPDATE (e.g. face submission then status
--    normalize / auto-analyze) overwrites last_event with 'UPDATE' and the
--    admin frontend drops the toast (isInsertish === false).
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
  v_last_event text;
  v_bucket timestamptz := date_trunc('hour', now());
  v_count bigint;
  v_cap bigint;
  v_enabled text;
  v_effective_event text;
BEGIN
  SELECT setting_value INTO v_enabled
    FROM public.app_settings
   WHERE setting_key = 'realtime_admin_broadcast_enabled';
  IF v_enabled IS NOT NULL AND v_enabled <> 'true' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  INSERT INTO public.admin_broadcast_rate_counter (bucket_hour, event_count)
  VALUES (v_bucket, 1)
  ON CONFLICT (bucket_hour) DO UPDATE
    SET event_count = admin_broadcast_rate_counter.event_count + 1
  RETURNING event_count INTO v_count;

  SELECT COALESCE(NULLIF(setting_value, '')::bigint, 50000) INTO v_cap
    FROM public.app_settings
   WHERE setting_key = 'realtime_admin_broadcast_hourly_cap';

  IF v_count > COALESCE(v_cap, 50000) THEN
    UPDATE public.app_settings
       SET setting_value = 'false'
     WHERE setting_key = 'realtime_admin_broadcast_enabled';
    RAISE WARNING 'admin_broadcast hourly cap exceeded (% events); kill switch auto-disabled', v_count;
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP = 'DELETE' THEN
    v_row_id := COALESCE((to_jsonb(OLD)->>'id'), (to_jsonb(OLD)->>'setting_key'), '');
  ELSE
    v_row_id := COALESCE((to_jsonb(NEW)->>'id'), (to_jsonb(NEW)->>'setting_key'), '');
  END IF;

  SELECT updated_at, last_event INTO v_last_at, v_last_event
    FROM public.admin_broadcast WHERE topic = v_topic;

  -- Preserve INSERT priority across the throttle window so admin UI never
  -- loses the "new row" signal when a near-instant UPDATE follows.
  v_effective_event := TG_OP;
  IF v_last_at IS NOT NULL AND (now() - v_last_at) < interval '500 milliseconds' THEN
    IF v_last_event = 'INSERT' OR TG_OP = 'INSERT' THEN
      v_effective_event := 'INSERT';
    END IF;
    UPDATE public.admin_broadcast
       SET version = version + 1,
           last_event = v_effective_event,
           last_row_id = v_row_id
     WHERE topic = v_topic;
  ELSE
    INSERT INTO public.admin_broadcast (topic, version, last_event, last_row_id, updated_at)
    VALUES (v_topic, 1, v_effective_event, v_row_id, now())
    ON CONFLICT (topic) DO UPDATE
      SET version = admin_broadcast.version + 1,
          last_event = EXCLUDED.last_event,
          last_row_id = EXCLUDED.last_row_id,
          updated_at = now();
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$function$;
