
CREATE OR REPLACE FUNCTION public.set_swift_pay_topup_expiry()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.expires_at IS NULL THEN
    NEW.expires_at := COALESCE(NEW.created_at, now()) + interval '1 hour';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_swift_pay_topup_expiry ON public.swift_pay_topups;
CREATE TRIGGER trg_set_swift_pay_topup_expiry
BEFORE INSERT ON public.swift_pay_topups
FOR EACH ROW EXECUTE FUNCTION public.set_swift_pay_topup_expiry();

CREATE OR REPLACE FUNCTION public.expire_stale_swift_pay_topups()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE public.swift_pay_topups
     SET status = 'expired',
         error_message = COALESCE(error_message, 'Auto-expired: payment not completed within 1 hour'),
         updated_at = now()
   WHERE status = 'pending'
     AND expires_at IS NOT NULL
     AND expires_at < now();
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.expire_stale_swift_pay_topups() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expire_stale_swift_pay_topups() TO service_role;

UPDATE public.swift_pay_topups
   SET expires_at = created_at + interval '1 hour'
 WHERE expires_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_swift_pay_topups_pending_expires
  ON public.swift_pay_topups (expires_at)
  WHERE status = 'pending';
