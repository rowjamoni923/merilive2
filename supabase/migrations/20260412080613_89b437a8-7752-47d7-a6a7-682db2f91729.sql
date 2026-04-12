-- Add PK to profiles if missing
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'profiles_pkey' AND conrelid = 'public.profiles'::regclass) THEN
    ALTER TABLE public.profiles ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);
  END IF;
END $$;

-- Add FK: topup_helpers.user_id -> profiles.id
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'topup_helpers_user_id_fkey') THEN
    ALTER TABLE public.topup_helpers
      ADD CONSTRAINT topup_helpers_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Add FK: agency_hosts.host_id -> profiles.id
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'agency_hosts_host_id_fkey') THEN
    ALTER TABLE public.agency_hosts
      ADD CONSTRAINT agency_hosts_host_id_fkey
      FOREIGN KEY (host_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Add FK: agency_earnings_transfers.host_id -> profiles.id
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'agency_earnings_transfers_host_id_fkey') THEN
    ALTER TABLE public.agency_earnings_transfers
      ADD CONSTRAINT agency_earnings_transfers_host_id_fkey
      FOREIGN KEY (host_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_topup_helpers_user_id ON public.topup_helpers(user_id);
CREATE INDEX IF NOT EXISTS idx_agency_hosts_host_id ON public.agency_hosts(host_id);