-- Update release_expired_withdrawal_locks to use 1 hour for consistency
CREATE OR REPLACE FUNCTION public.release_expired_withdrawal_locks()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- NEW system: clear expired claim_locked_until on pending withdrawals
  -- This correctly uses the timestamp set by claim_agency_withdrawal (now 1 hour)
  UPDATE public.agency_withdrawals
  SET assigned_helper_id = NULL,
      claim_locked_until = NULL
  WHERE status = 'pending'
    AND claim_locked_until IS NOT NULL
    AND claim_locked_until < now();

  -- LEGACY system: revert old style locks (defensive, harmless if empty)
  -- Updated from 30 seconds to 1 hour (3600 seconds)
  UPDATE public.agency_withdrawals aw
  SET status = 'pending', assigned_helper_id = NULL
  FROM public.agency_withdrawal_locks l
  WHERE aw.id = l.withdrawal_id
    AND l.locked_at < (now() - interval '1 hour')
    AND aw.status = 'claimed';

  DELETE FROM public.agency_withdrawal_locks
  WHERE locked_at < (now() - interval '1 hour');
END;
$$;
