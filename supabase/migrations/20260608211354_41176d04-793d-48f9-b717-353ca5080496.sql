-- PK Battle P5: cleanup + instant end trigger
-- R3: drop unused pk_match_queue table (no client refs, no RPCs reference it)
DROP TABLE IF EXISTS public.pk_match_queue CASCADE;

-- R5+: server-side auto-end trigger.
-- Fires on every score update; if duration has expired and battle is still
-- active, hand off to the existing SECURITY DEFINER end_pk_battle RPC.
-- The pg_cron `pk-battle-tick-every-5s` job remains as a safety net for
-- battles that expire WITHOUT any further score update.
CREATE OR REPLACE FUNCTION public.pk_battle_autoend()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Recursion guard: end_pk_battle sets status='ended', which fires this
  -- trigger again — at that point status != 'active' so we skip cleanly.
  IF NEW.status = 'active'
     AND NEW.started_at IS NOT NULL
     AND NEW.duration_seconds IS NOT NULL
     AND NEW.started_at + (NEW.duration_seconds || ' seconds')::interval <= now()
  THEN
    PERFORM public.end_pk_battle(NEW.id, 'time_up');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS pk_battle_autoend_trg ON public.pk_battles;
CREATE TRIGGER pk_battle_autoend_trg
AFTER UPDATE OF challenger_score, opponent_score ON public.pk_battles
FOR EACH ROW
EXECUTE FUNCTION public.pk_battle_autoend();