ALTER TABLE public.agency_earnings_transfers ALTER COLUMN host_id DROP NOT NULL;

-- Defense: require host_id when transfer_type is a per-host kind
CREATE OR REPLACE FUNCTION public.guard_agency_earnings_transfers_host()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.transfer_type IN ('weekly_auto') AND NEW.host_id IS NULL THEN
    RAISE EXCEPTION 'host_id is required for transfer_type %', NEW.transfer_type;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_guard_agency_earnings_transfers_host ON public.agency_earnings_transfers;
CREATE TRIGGER tg_guard_agency_earnings_transfers_host
  BEFORE INSERT OR UPDATE ON public.agency_earnings_transfers
  FOR EACH ROW EXECUTE FUNCTION public.guard_agency_earnings_transfers_host();