
-- 1) Backfill: collapse any leftover duplicate active rows so the unique index can be built.
--    For each caller/host that has multiple active rows, keep the newest and mark older ones as 'ended/superseded_by_new_call'.
WITH ranked_caller AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY caller_id ORDER BY started_at DESC, created_at DESC) AS rn
    FROM public.private_calls
   WHERE status IN ('pending','ringing','connected')
),
caller_dups AS (
  SELECT id FROM ranked_caller WHERE rn > 1
)
UPDATE public.private_calls
   SET status = 'ended',
       ended_at = COALESCE(ended_at, now()),
       end_reason = COALESCE(end_reason, 'superseded_by_new_call'),
       settled_at = COALESCE(settled_at, now()),
       updated_at = now()
 WHERE id IN (SELECT id FROM caller_dups);

WITH ranked_host AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY host_id ORDER BY started_at DESC, created_at DESC) AS rn
    FROM public.private_calls
   WHERE status IN ('pending','ringing','connected')
),
host_dups AS (
  SELECT id FROM ranked_host WHERE rn > 1
)
UPDATE public.private_calls
   SET status = 'ended',
       ended_at = COALESCE(ended_at, now()),
       end_reason = COALESCE(end_reason, 'superseded_by_new_call'),
       settled_at = COALESCE(settled_at, now()),
       updated_at = now()
 WHERE id IN (SELECT id FROM host_dups);

-- 2) Partial unique indexes — at most ONE active row per caller and per host.
CREATE UNIQUE INDEX IF NOT EXISTS private_calls_one_active_per_caller
  ON public.private_calls (caller_id)
  WHERE status IN ('pending','ringing','connected');

CREATE UNIQUE INDEX IF NOT EXISTS private_calls_one_active_per_host
  ON public.private_calls (host_id)
  WHERE status IN ('pending','ringing','connected');

-- 3) Extend trigger to handle 'cancelled' status as well.
CREATE OR REPLACE FUNCTION public.clear_private_call_busy_flags_on_terminal()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.status IN ('ended', 'declined', 'missed', 'cancelled')
     AND COALESCE(OLD.status, '') IS DISTINCT FROM NEW.status THEN
    PERFORM set_config('app.bypass_profile_protection', 'true', true);
    UPDATE public.profiles
       SET is_in_call = false,
           current_call_id = NULL,
           updated_at = now()
     WHERE id IN (NEW.caller_id, NEW.host_id)
       AND current_call_id = NEW.id;
  END IF;

  RETURN NEW;
END;
$function$;
