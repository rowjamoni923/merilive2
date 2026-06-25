
CREATE OR REPLACE FUNCTION public.random_match_on_live_start()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _auto BOOLEAN;
BEGIN
  -- Only on new active stream
  IF NEW.status IS DISTINCT FROM 'live' AND NEW.is_live IS NOT TRUE THEN
    RETURN NEW;
  END IF;
  -- Read or create the host's availability row
  SELECT auto_on_when_live INTO _auto FROM public.host_match_availability WHERE host_id = NEW.host_id;
  IF _auto IS NULL THEN
    INSERT INTO public.host_match_availability(host_id, is_available, auto_on_when_live, turned_on_at, last_active_at)
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
END;$$;

DROP TRIGGER IF EXISTS trg_random_match_on_live_start ON public.live_streams;
CREATE TRIGGER trg_random_match_on_live_start
  AFTER INSERT ON public.live_streams
  FOR EACH ROW EXECUTE FUNCTION public.random_match_on_live_start();
