CREATE OR REPLACE FUNCTION public.guard_private_call_supersede_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND COALESCE(NEW.end_reason, '') = 'superseded_by_new_call'
     AND OLD.status = 'connected'
     AND NEW.status <> OLD.status THEN
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE'
     AND COALESCE(NEW.end_reason, '') = 'superseded_by_new_call'
     AND OLD.status IN ('pending', 'ringing')
     AND NEW.status <> OLD.status
     AND (auth.uid() IS NULL OR auth.uid() NOT IN (OLD.caller_id, OLD.host_id)) THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_private_call_supersede_update ON public.private_calls;
CREATE TRIGGER trg_guard_private_call_supersede_update
BEFORE UPDATE ON public.private_calls
FOR EACH ROW
EXECUTE FUNCTION public.guard_private_call_supersede_update();

CREATE OR REPLACE FUNCTION public.clear_private_call_busy_flags_on_terminal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.status IN ('ended', 'declined', 'missed')
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
$$;

DROP TRIGGER IF EXISTS trg_clear_private_call_busy_flags_on_terminal ON public.private_calls;
CREATE TRIGGER trg_clear_private_call_busy_flags_on_terminal
AFTER UPDATE ON public.private_calls
FOR EACH ROW
EXECUTE FUNCTION public.clear_private_call_busy_flags_on_terminal();

REVOKE EXECUTE ON FUNCTION public.guard_private_call_supersede_update() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.clear_private_call_busy_flags_on_terminal() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.guard_private_call_supersede_update() TO authenticated;
GRANT EXECUTE ON FUNCTION public.clear_private_call_busy_flags_on_terminal() TO authenticated;