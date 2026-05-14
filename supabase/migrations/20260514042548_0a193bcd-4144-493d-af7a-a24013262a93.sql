ALTER TABLE public.agency_withdrawals ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE OR REPLACE FUNCTION public.touch_agency_withdrawals_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_agency_withdrawals_updated_at ON public.agency_withdrawals;
CREATE TRIGGER trg_agency_withdrawals_updated_at
BEFORE UPDATE ON public.agency_withdrawals
FOR EACH ROW EXECUTE FUNCTION public.touch_agency_withdrawals_updated_at();