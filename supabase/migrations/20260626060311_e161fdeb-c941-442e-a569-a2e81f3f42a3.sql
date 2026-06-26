CREATE OR REPLACE FUNCTION public.random_match_on_live_start()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _auto boolean;
BEGIN
  -- Only react to real active live starts. `live_streams` has `is_active`, not
  -- `is_live`; referencing non-existent NEW.is_live blocks Go Live inserts.
  IF coalesce(NEW.is_active, false) IS DISTINCT FROM true
     OR coalesce(NEW.status, '') NOT IN ('starting', 'live', 'active') THEN
    RETURN NEW;
  END IF;

  SELECT auto_on_when_live
    INTO _auto
  FROM public.host_match_availability
  WHERE host_id = NEW.host_id;

  IF _auto IS NULL THEN
    INSERT INTO public.host_match_availability(
      host_id,
      is_available,
      auto_on_when_live,
      turned_on_at,
      last_active_at
    )
    VALUES (NEW.host_id, TRUE, TRUE, now(), now())
    ON CONFLICT (host_id) DO NOTHING;
  ELSIF _auto = TRUE THEN
    UPDATE public.host_match_availability
       SET is_available = TRUE,
           turned_on_at = COALESCE(turned_on_at, now()),
           turned_off_at = NULL,
           last_active_at = now()
     WHERE host_id = NEW.host_id;
  END IF;

  RETURN NEW;
END;
$function$;