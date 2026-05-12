
-- 1. Drop the older 1-arg overload so PostgREST never picks the wrong one
DROP FUNCTION IF EXISTS public.claim_agency_withdrawal(uuid);

-- 2. Update the cleanup function to handle BOTH lock systems
CREATE OR REPLACE FUNCTION public.release_expired_withdrawal_locks()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- NEW system: clear expired claim_locked_until on pending withdrawals
  UPDATE public.agency_withdrawals
  SET assigned_helper_id = NULL,
      claim_locked_until = NULL
  WHERE status = 'pending'
    AND claim_locked_until IS NOT NULL
    AND claim_locked_until < now();

  -- LEGACY system: revert old style locks (defensive, harmless if empty)
  UPDATE public.agency_withdrawals aw
  SET status = 'pending', assigned_helper_id = NULL
  FROM public.agency_withdrawal_locks l
  WHERE aw.id = l.withdrawal_id
    AND l.locked_at < (now() - interval '30 seconds')
    AND aw.status = 'claimed';

  DELETE FROM public.agency_withdrawal_locks
  WHERE locked_at < (now() - interval '30 seconds');
END;
$function$;

-- 3. Make sure pg_cron is available
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 4. Drop any old version of the job and (re)schedule it every 15 seconds
DO $$
DECLARE
  _jobid bigint;
BEGIN
  SELECT jobid INTO _jobid FROM cron.job WHERE jobname = 'release-expired-withdrawal-locks';
  IF _jobid IS NOT NULL THEN
    PERFORM cron.unschedule(_jobid);
  END IF;
END $$;

SELECT cron.schedule(
  'release-expired-withdrawal-locks',
  '15 seconds',
  $$ SELECT public.release_expired_withdrawal_locks(); $$
);
