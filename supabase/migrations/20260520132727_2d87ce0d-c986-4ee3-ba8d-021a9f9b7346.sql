CREATE TABLE IF NOT EXISTS public.rating_reward_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id uuid NOT NULL,
  user_id uuid NOT NULL,
  action text NOT NULL CHECK (action IN ('approved','rejected','reverted')),
  admin_id uuid,
  reward_type text,
  reward_amount integer,
  rejection_reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rrlog_claim ON public.rating_reward_audit_log(claim_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rrlog_admin ON public.rating_reward_audit_log(admin_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rrlog_created ON public.rating_reward_audit_log(created_at DESC);

ALTER TABLE public.rating_reward_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin session full access" ON public.rating_reward_audit_log;
CREATE POLICY "Admin session full access" ON public.rating_reward_audit_log
  FOR ALL USING (public.is_active_admin_session())
  WITH CHECK (public.is_active_admin_session());

CREATE OR REPLACE FUNCTION public.tg_rating_reward_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (TG_OP = 'UPDATE')
     AND NEW.status IS DISTINCT FROM OLD.status
     AND NEW.status IN ('approved','rejected') THEN
    INSERT INTO public.rating_reward_audit_log(
      claim_id, user_id, action, admin_id,
      reward_type, reward_amount, rejection_reason
    ) VALUES (
      NEW.id, NEW.user_id, NEW.status, NEW.reviewed_by,
      NEW.reward_type, NEW.reward_amount, NEW.rejection_reason
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_rating_reward_audit_trg ON public.rating_reward_claims;
CREATE TRIGGER tg_rating_reward_audit_trg
  AFTER UPDATE ON public.rating_reward_claims
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_rating_reward_audit();

INSERT INTO public.rating_reward_audit_log (claim_id, user_id, action, admin_id, reward_type, reward_amount, rejection_reason, created_at)
SELECT c.id, c.user_id, c.status, c.reviewed_by, c.reward_type, c.reward_amount, c.rejection_reason, COALESCE(c.reviewed_at, c.updated_at, c.created_at)
FROM public.rating_reward_claims c
LEFT JOIN public.rating_reward_audit_log l ON l.claim_id = c.id
WHERE c.status IN ('approved','rejected') AND l.id IS NULL;