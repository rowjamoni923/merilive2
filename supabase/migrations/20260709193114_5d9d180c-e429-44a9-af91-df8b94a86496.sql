
-- User-reported payment claims (support cases): admin logs "user says they paid, no record"
CREATE TABLE IF NOT EXISTS public.user_payment_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reported_user_id uuid,                     -- profiles.id (nullable if only phone)
  reported_app_uid text,                      -- e.g. 0733697258
  reported_phone text,
  reported_email text,
  claimed_amount numeric,
  claimed_currency text,
  claimed_payment_method text,
  claimed_paid_at timestamptz,
  claimed_reference text,                     -- gateway txn / bkash trx id / etc.
  proof_url text,                             -- screenshot uploaded by admin
  channel text NOT NULL DEFAULT 'support',    -- support | chat | email | whatsapp | admin_note
  status text NOT NULL DEFAULT 'open',        -- open | investigating | matched | refunded | rejected | closed
  matched_source_table text,                  -- e.g. recharge_transactions / swift_pay_topups
  matched_source_id uuid,
  matched_at timestamptz,
  matched_by uuid,
  notes text,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_payment_claims TO authenticated;
GRANT ALL ON public.user_payment_claims TO service_role;

ALTER TABLE public.user_payment_claims ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins_full_access_user_payment_claims"
  ON public.user_payment_claims
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS idx_user_payment_claims_status ON public.user_payment_claims(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_payment_claims_uid ON public.user_payment_claims(reported_app_uid);
CREATE INDEX IF NOT EXISTS idx_user_payment_claims_user ON public.user_payment_claims(reported_user_id);

CREATE TRIGGER trg_user_payment_claims_updated
  BEFORE UPDATE ON public.user_payment_claims
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Realtime for instant admin updates
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.user_payment_claims;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;
