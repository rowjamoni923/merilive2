-- 1) Backfill: move any legacy commission stuck in agencies.beans_balance into wallet_balance
--    (withdrawal flow + Agency Dashboard Total Beans only read wallet_balance).
DO $$
DECLARE
  _row RECORD;
BEGIN
  FOR _row IN
    SELECT id, COALESCE(beans_balance, 0)::bigint AS bb
      FROM public.agencies
     WHERE COALESCE(beans_balance, 0) > 0
  LOOP
    UPDATE public.agencies
       SET wallet_balance = COALESCE(wallet_balance, 0) + _row.bb,
           beans_balance  = 0,
           updated_at     = now()
     WHERE id = _row.id;

    INSERT INTO public.agency_earnings_transfers (
      agency_id, host_id, host_name, host_uid, amount,
      commission_rate, transfer_type, status,
      period_start, period_end, agency_name, notes
    )
    SELECT a.id, a.owner_id, a.name, NULL,
           _row.bb, 0, 'legacy_backfill', 'completed',
           now(), now(), a.name,
           'Migrated legacy beans_balance commission into wallet_balance (Total Beans / withdrawable).'
      FROM public.agencies a WHERE a.id = _row.id;
  END LOOP;
END$$;

-- 2) Weekly automatic schedule — every Monday 00:05 UTC.
--    pg_cron runs as the database owner, which is allowed to execute the
--    service_role-restricted RPC.
SELECT cron.unschedule(jobid)
  FROM cron.job
 WHERE jobname = 'process-weekly-agency-transfers';

SELECT cron.schedule(
  'process-weekly-agency-transfers',
  '5 0 * * 1',
  $$ SELECT public.process_weekly_agency_transfers(); $$
);