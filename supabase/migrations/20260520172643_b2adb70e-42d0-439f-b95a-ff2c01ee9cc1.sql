ALTER TABLE public.topup_helpers
  ADD COLUMN IF NOT EXISTS is_listed boolean NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_topup_helpers_is_listed
  ON public.topup_helpers(is_listed)
  WHERE is_listed = true;