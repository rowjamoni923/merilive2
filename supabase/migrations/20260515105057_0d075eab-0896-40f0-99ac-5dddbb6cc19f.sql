
CREATE TABLE IF NOT EXISTS public.account_deletion_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT NOT NULL,
  username TEXT,
  reason TEXT,
  source TEXT NOT NULL DEFAULT 'web',
  status TEXT NOT NULL DEFAULT 'pending',
  processed_at TIMESTAMPTZ,
  processed_by UUID,
  notes TEXT,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_account_deletion_requests_email ON public.account_deletion_requests(email);
CREATE INDEX IF NOT EXISTS idx_account_deletion_requests_status ON public.account_deletion_requests(status);
CREATE INDEX IF NOT EXISTS idx_account_deletion_requests_created ON public.account_deletion_requests(created_at DESC);

ALTER TABLE public.account_deletion_requests ENABLE ROW LEVEL SECURITY;

-- Anyone (incl. anon) can submit a deletion request — required by Google Play.
DROP POLICY IF EXISTS "Anyone can submit deletion request" ON public.account_deletion_requests;
CREATE POLICY "Anyone can submit deletion request"
  ON public.account_deletion_requests
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- Only admin sessions can read / manage the queue.
DROP POLICY IF EXISTS "Admin session full access on deletion requests" ON public.account_deletion_requests;
CREATE POLICY "Admin session full access on deletion requests"
  ON public.account_deletion_requests
  FOR ALL
  TO anon, authenticated
  USING (public.is_active_admin_session())
  WITH CHECK (public.is_active_admin_session());
