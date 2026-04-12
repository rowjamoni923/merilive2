-- Step 1: Add PK to agencies
ALTER TABLE public.agencies
  ADD CONSTRAINT agencies_pkey PRIMARY KEY (id);

-- Step 2: Add PK to topup_helpers (may already exist from prior migration)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'topup_helpers_pkey' AND conrelid = 'public.topup_helpers'::regclass) THEN
    ALTER TABLE public.topup_helpers ADD CONSTRAINT topup_helpers_pkey PRIMARY KEY (id);
  END IF;
END $$;

-- Step 3: Add assigned_helper_id column
ALTER TABLE public.agency_withdrawals
  ADD COLUMN IF NOT EXISTS assigned_helper_id uuid;

-- Step 4: Add FK relationships
ALTER TABLE public.agency_withdrawals
  ADD CONSTRAINT agency_withdrawals_agency_id_fkey
  FOREIGN KEY (agency_id) REFERENCES public.agencies(id) ON DELETE CASCADE;

ALTER TABLE public.agency_withdrawals
  ADD CONSTRAINT agency_withdrawals_assigned_helper_id_fkey
  FOREIGN KEY (assigned_helper_id) REFERENCES public.topup_helpers(id);

-- Step 5: Performance indexes
CREATE INDEX IF NOT EXISTS idx_agency_withdrawals_agency_id ON public.agency_withdrawals(agency_id);
CREATE INDEX IF NOT EXISTS idx_agency_withdrawals_assigned_helper ON public.agency_withdrawals(assigned_helper_id);
CREATE INDEX IF NOT EXISTS idx_agency_withdrawals_status ON public.agency_withdrawals(status);