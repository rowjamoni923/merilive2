
-- 1. Add activation columns to agencies
ALTER TABLE public.agencies
  ADD COLUMN IF NOT EXISTS activation_deadline timestamptz,
  ADD COLUMN IF NOT EXISTS activation_status text NOT NULL DEFAULT 'pending'
    CHECK (activation_status IN ('pending','active','closed')),
  ADD COLUMN IF NOT EXISTS active_host_count integer NOT NULL DEFAULT 0;

-- 2. Back-fill deadline for existing rows
UPDATE public.agencies
SET activation_deadline = created_at + INTERVAL '30 days'
WHERE activation_deadline IS NULL;

-- 3. Default deadline for future inserts via trigger
CREATE OR REPLACE FUNCTION public.agency_set_activation_defaults()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.activation_deadline IS NULL THEN
    NEW.activation_deadline := COALESCE(NEW.created_at, now()) + INTERVAL '30 days';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_agency_activation_defaults ON public.agencies;
CREATE TRIGGER trg_agency_activation_defaults
  BEFORE INSERT ON public.agencies
  FOR EACH ROW EXECUTE FUNCTION public.agency_set_activation_defaults();

-- 4. Recalculate active host count + latch activation_status='active' once 10 reached
CREATE OR REPLACE FUNCTION public.recalc_agency_activation(p_agency_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
  v_status text;
  v_deadline timestamptz;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM public.agency_hosts
  WHERE agency_id = p_agency_id
    AND status = 'active'
    AND left_at IS NULL;

  SELECT activation_status, activation_deadline
    INTO v_status, v_deadline
  FROM public.agencies
  WHERE id = p_agency_id
  FOR UPDATE;

  IF v_status IS NULL THEN RETURN; END IF;

  -- Latch to active once the 10-host bar is met (permanent)
  IF v_status <> 'closed' AND v_count >= 10 THEN
    UPDATE public.agencies
       SET active_host_count = v_count,
           activation_status = 'active',
           updated_at = now()
     WHERE id = p_agency_id;
  ELSE
    UPDATE public.agencies
       SET active_host_count = v_count,
           updated_at = now()
     WHERE id = p_agency_id;
  END IF;
END;
$$;

-- 5. Trigger on agency_hosts changes
CREATE OR REPLACE FUNCTION public.agency_hosts_recalc_trg()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.recalc_agency_activation(OLD.agency_id);
    RETURN OLD;
  ELSE
    PERFORM public.recalc_agency_activation(NEW.agency_id);
    IF TG_OP = 'UPDATE' AND OLD.agency_id IS DISTINCT FROM NEW.agency_id THEN
      PERFORM public.recalc_agency_activation(OLD.agency_id);
    END IF;
    RETURN NEW;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS trg_agency_hosts_recalc ON public.agency_hosts;
CREATE TRIGGER trg_agency_hosts_recalc
  AFTER INSERT OR UPDATE OR DELETE ON public.agency_hosts
  FOR EACH ROW EXECUTE FUNCTION public.agency_hosts_recalc_trg();

-- 6. Auto-close overdue pending agencies
CREATE OR REPLACE FUNCTION public.auto_close_overdue_agencies()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  WITH closed AS (
    UPDATE public.agencies
       SET activation_status = 'closed',
           is_active = false,
           is_blocked = true,
           blocked_at = COALESCE(blocked_at, now()),
           blocked_reason = COALESCE(blocked_reason, 'Auto-closed: failed to activate 10 hosts within 30 days'),
           updated_at = now()
     WHERE activation_status = 'pending'
       AND activation_deadline IS NOT NULL
       AND activation_deadline < now()
       AND active_host_count < 10
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_count FROM closed;
  RETURN v_count;
END;
$$;

-- 7. Back-fill counts + latch already-qualified agencies
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT id FROM public.agencies LOOP
    PERFORM public.recalc_agency_activation(r.id);
  END LOOP;
END $$;

-- 8. Schedule auto-close every 15 minutes
CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
BEGIN
  PERFORM cron.unschedule('auto-close-overdue-agencies');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'auto-close-overdue-agencies',
  '*/15 * * * *',
  $$ SELECT public.auto_close_overdue_agencies(); $$
);
