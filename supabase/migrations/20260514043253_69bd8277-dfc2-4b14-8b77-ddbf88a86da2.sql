ALTER TABLE public.face_verification_submissions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE public.helper_upgrade_requests ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE public.new_host_live_bonus_progress ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE public.news_sources ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE public.pk_battles ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE public.role_frames ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE public.user_reports ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE public.user_roles ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE OR REPLACE FUNCTION public.touch_agency_withdrawals_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_agency_withdrawals_updated_at ON public.agency_withdrawals;
DROP FUNCTION IF EXISTS public.touch_agency_withdrawals_updated_at();

DROP TRIGGER IF EXISTS update_agency_withdrawals_updated_at ON public.agency_withdrawals;
CREATE TRIGGER update_agency_withdrawals_updated_at
BEFORE UPDATE ON public.agency_withdrawals
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();