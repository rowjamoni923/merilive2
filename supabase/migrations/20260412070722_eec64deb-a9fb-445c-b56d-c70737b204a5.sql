
-- Add primary key to topup_helpers (required for FK references)
ALTER TABLE public.topup_helpers ADD CONSTRAINT topup_helpers_pkey PRIMARY KEY (id);

-- Now add FK from helper_country_payment_methods to topup_helpers
ALTER TABLE public.helper_country_payment_methods
  ADD CONSTRAINT helper_country_payment_methods_helper_id_fkey
  FOREIGN KEY (helper_id) REFERENCES public.topup_helpers(id) ON DELETE CASCADE;
