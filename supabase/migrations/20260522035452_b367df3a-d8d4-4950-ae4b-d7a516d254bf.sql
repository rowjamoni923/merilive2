DROP TRIGGER IF EXISTS trigger_notify_incoming_call ON public.call_events;

CREATE OR REPLACE FUNCTION public.notify_on_incoming_call()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Pkg84: Incoming call delivery is handled exclusively by the `call-deliver`
  -- edge function after `start_private_call` succeeds. This old call_events
  -- trigger path is intentionally disabled to avoid duplicate/malformed
  -- call_received rows and duplicate push behavior.
  RETURN NEW;
END;
$$;