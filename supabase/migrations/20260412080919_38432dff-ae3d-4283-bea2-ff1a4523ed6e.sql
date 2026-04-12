-- helper_transactions: add user_id column and FK
ALTER TABLE public.helper_transactions
  ADD COLUMN IF NOT EXISTS user_id uuid;

ALTER TABLE public.helper_transactions
  ADD CONSTRAINT helper_transactions_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

-- helper_withdrawal_requests: code uses host_id_fkey but column is helper_id
-- Add a duplicate FK with the expected name pointing to profiles via topup_helpers
-- Actually, the join is profiles!helper_withdrawal_requests_host_id_fkey
-- This means the code expects helper_withdrawal_requests to have a host_id column pointing to profiles
-- Let's add host_id column
ALTER TABLE public.helper_withdrawal_requests
  ADD COLUMN IF NOT EXISTS host_id uuid;

ALTER TABLE public.helper_withdrawal_requests
  ADD CONSTRAINT helper_withdrawal_requests_host_id_fkey
  FOREIGN KEY (host_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_helper_transactions_user ON public.helper_transactions(user_id);