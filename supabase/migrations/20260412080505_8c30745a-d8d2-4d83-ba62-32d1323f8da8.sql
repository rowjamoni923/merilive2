-- Add PKs to all agency-related tables that lack them
DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['agency_hosts','agency_commission_history','agency_diamond_transactions','agency_earnings_transfers','agency_performance','agency_rankings','sub_agents']
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint 
      WHERE conname = tbl || '_pkey' 
      AND conrelid = ('public.' || tbl)::regclass
    ) THEN
      EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I PRIMARY KEY (id)', tbl, tbl || '_pkey');
    END IF;
  END LOOP;
END $$;

-- Add FK: agency_hosts.agency_id -> agencies.id
ALTER TABLE public.agency_hosts
  ADD CONSTRAINT agency_hosts_agency_id_fkey
  FOREIGN KEY (agency_id) REFERENCES public.agencies(id) ON DELETE CASCADE;

-- Add FK: agency_commission_history.agency_id -> agencies.id
ALTER TABLE public.agency_commission_history
  ADD CONSTRAINT agency_commission_history_agency_id_fkey
  FOREIGN KEY (agency_id) REFERENCES public.agencies(id) ON DELETE CASCADE;

-- Add FK: agency_diamond_transactions.agency_id -> agencies.id
ALTER TABLE public.agency_diamond_transactions
  ADD CONSTRAINT agency_diamond_transactions_agency_id_fkey
  FOREIGN KEY (agency_id) REFERENCES public.agencies(id) ON DELETE CASCADE;

-- Add FK: agency_earnings_transfers.agency_id -> agencies.id
ALTER TABLE public.agency_earnings_transfers
  ADD CONSTRAINT agency_earnings_transfers_agency_id_fkey
  FOREIGN KEY (agency_id) REFERENCES public.agencies(id) ON DELETE CASCADE;

-- Add FK: agency_performance.agency_id -> agencies.id
ALTER TABLE public.agency_performance
  ADD CONSTRAINT agency_performance_agency_id_fkey
  FOREIGN KEY (agency_id) REFERENCES public.agencies(id) ON DELETE CASCADE;

-- Add FK: agency_rankings.agency_id -> agencies.id
ALTER TABLE public.agency_rankings
  ADD CONSTRAINT agency_rankings_agency_id_fkey
  FOREIGN KEY (agency_id) REFERENCES public.agencies(id) ON DELETE CASCADE;

-- Indexes for FK columns
CREATE INDEX IF NOT EXISTS idx_agency_hosts_agency_id ON public.agency_hosts(agency_id);
CREATE INDEX IF NOT EXISTS idx_agency_commission_history_agency_id ON public.agency_commission_history(agency_id);
CREATE INDEX IF NOT EXISTS idx_agency_earnings_transfers_agency_id ON public.agency_earnings_transfers(agency_id);
CREATE INDEX IF NOT EXISTS idx_agency_performance_agency_id ON public.agency_performance(agency_id);