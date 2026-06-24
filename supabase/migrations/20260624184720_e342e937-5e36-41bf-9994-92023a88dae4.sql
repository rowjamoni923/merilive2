
-- 1. Extend default expiry from 1 hour to 24 hours
CREATE OR REPLACE FUNCTION public.set_swift_pay_topup_expiry()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.expires_at IS NULL THEN
    NEW.expires_at := COALESCE(NEW.created_at, now()) + interval '24 hours';
  END IF;
  RETURN NEW;
END;
$$;

-- 2. Bump still-pending rows so they don't expire prematurely
UPDATE public.swift_pay_topups
   SET expires_at = created_at + interval '24 hours'
 WHERE status = 'pending'
   AND expires_at IS NOT NULL
   AND expires_at < created_at + interval '24 hours';

-- 3. Resurrect recently expired rows (last 7 days) into 'pending' so poller
--    can credit them if SwiftPay actually received the deposit. Older expired
--    rows stay as-is (will be handled via admin recovery RPC below).
UPDATE public.swift_pay_topups
   SET status = 'pending',
       expires_at = greatest(expires_at, now() + interval '24 hours'),
       error_message = NULL,
       last_polled_at = NULL,
       updated_at = now()
 WHERE status = 'expired'
   AND created_at >= now() - interval '7 days'
   AND credited_at IS NULL;

-- 4. Admin recovery RPC — manually re-open any expired row for poller to retry.
--    Owner/admin only. Idempotent.
CREATE OR REPLACE FUNCTION public.recover_swift_pay_topup(p_topup_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_row record;
BEGIN
  IF NOT (public.is_admin(auth.uid()) OR public.is_active_admin_session() OR COALESCE(auth.role(),'') = 'service_role') THEN
    RAISE EXCEPTION 'Unauthorized: admin only';
  END IF;

  SELECT * INTO v_row FROM public.swift_pay_topups WHERE id = p_topup_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'topup_not_found');
  END IF;

  IF v_row.status = 'credited' THEN
    RETURN jsonb_build_object('success', true, 'already_credited', true);
  END IF;

  UPDATE public.swift_pay_topups
     SET status = 'pending',
         expires_at = now() + interval '24 hours',
         error_message = NULL,
         last_polled_at = NULL,
         updated_at = now()
   WHERE id = p_topup_id;

  RETURN jsonb_build_object('success', true, 'reopened', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.recover_swift_pay_topup(uuid) TO authenticated, service_role;
