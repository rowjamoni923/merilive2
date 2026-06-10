
-- Ensure pg_cron is available (no-op if already enabled)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Drop any previously scheduled versions (idempotent)
DO $$
BEGIN
  PERFORM cron.unschedule('cleanup-expired-call-reservations');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  PERFORM cron.unschedule('cleanup-old-gift-combos');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- C4: every minute sweep expired call balance reservations
SELECT cron.schedule(
  'cleanup-expired-call-reservations',
  '* * * * *',
  $$SELECT public.cleanup_expired_call_reservations();$$
);

-- G7: hourly delete day-old combo rows
SELECT cron.schedule(
  'cleanup-old-gift-combos',
  '0 * * * *',
  $$SELECT public.cleanup_old_gift_combos();$$
);
