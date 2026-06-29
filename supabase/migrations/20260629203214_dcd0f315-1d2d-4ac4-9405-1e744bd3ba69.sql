-- Performance hardening: stop DB hammering from old clients and speed common reads.

-- 1) Skip true no-op profile UPDATEs before updated_at/audit triggers do work.
-- This protects against old APK/web clients repeatedly writing the same equipped_* ids.
CREATE OR REPLACE FUNCTION public.skip_noop_profile_updates()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW IS NOT DISTINCT FROM OLD THEN
    RETURN NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS aa_profiles_skip_noop_updates ON public.profiles;
CREATE TRIGGER aa_profiles_skip_noop_updates
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.skip_noop_profile_updates();

-- 2) Notifications unread fetch: user_id + unread + newest first.
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread_created_at
ON public.notifications (user_id, is_read, created_at DESC);

-- 3) SwiftPay poller: only pending/recovery rows that are due for polling.
CREATE INDEX IF NOT EXISTS idx_swift_pay_topups_poll_due
ON public.swift_pay_topups (status, last_polled_at, created_at)
WHERE status IN ('pending', 'paid', 'expired');

CREATE INDEX IF NOT EXISTS idx_swift_pay_topups_external_status
ON public.swift_pay_topups (external_user_id, status)
WHERE status IN ('paid', 'credited');