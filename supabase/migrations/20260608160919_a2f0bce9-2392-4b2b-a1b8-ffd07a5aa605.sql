-- Honest-private-call fix (BE-P0-2)
DROP POLICY IF EXISTS "Hosts can update their calls" ON public.private_calls;
DROP POLICY IF EXISTS "Call participants can update their private calls" ON public.private_calls;

CREATE POLICY "Participants can update their private calls"
ON public.private_calls
FOR UPDATE
TO authenticated
USING (
  auth.uid() = caller_id OR auth.uid() = host_id
)
WITH CHECK (
  auth.uid() = caller_id OR auth.uid() = host_id
);

CREATE OR REPLACE FUNCTION public.private_calls_guard_server_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _current_role text := current_user;
BEGIN
  IF _current_role IN ('service_role', 'supabase_admin', 'postgres') THEN
    RETURN NEW;
  END IF;

  IF NEW.caller_id IS DISTINCT FROM OLD.caller_id
     OR NEW.host_id IS DISTINCT FROM OLD.host_id THEN
    RAISE EXCEPTION 'private_calls: caller_id/host_id are immutable'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.status                  IS DISTINCT FROM OLD.status
     OR NEW.end_reason           IS DISTINCT FROM COALESCE(OLD.end_reason, NEW.end_reason)
     OR NEW.final_status         IS DISTINCT FROM COALESCE(OLD.final_status, NEW.final_status)
     OR NEW.coins_spent          IS DISTINCT FROM COALESCE(OLD.coins_spent, NEW.coins_spent)
     OR NEW.total_coins_deducted IS DISTINCT FROM COALESCE(OLD.total_coins_deducted, NEW.total_coins_deducted)
     OR NEW.host_earned          IS DISTINCT FROM COALESCE(OLD.host_earned, NEW.host_earned)
     OR NEW.last_billed_minute   IS DISTINCT FROM COALESCE(OLD.last_billed_minute, NEW.last_billed_minute)
     OR NEW.total_minutes_billed IS DISTINCT FROM COALESCE(OLD.total_minutes_billed, NEW.total_minutes_billed)
     OR NEW.viewer_rate_per_min  IS DISTINCT FROM COALESCE(OLD.viewer_rate_per_min, NEW.viewer_rate_per_min)
     OR NEW.host_rate_per_min    IS DISTINCT FROM COALESCE(OLD.host_rate_per_min, NEW.host_rate_per_min)
     OR NEW.platform_cut_percent IS DISTINCT FROM COALESCE(OLD.platform_cut_percent, NEW.platform_cut_percent)
     OR NEW.last_billing_at      IS DISTINCT FROM COALESCE(OLD.last_billing_at, NEW.last_billing_at)
     OR NEW.connected_at         IS DISTINCT FROM COALESCE(OLD.connected_at, NEW.connected_at)
     OR NEW.accepted_at          IS DISTINCT FROM COALESCE(OLD.accepted_at, NEW.accepted_at)
     OR NEW.ended_at             IS DISTINCT FROM COALESCE(OLD.ended_at, NEW.ended_at)
  THEN
    RAISE EXCEPTION 'private_calls: server-owned column cannot be written by client (use accept_private_call / end_private_call / bill_call_minute / settle_private_call)'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_private_calls_guard_server_columns ON public.private_calls;
CREATE TRIGGER trg_private_calls_guard_server_columns
BEFORE UPDATE ON public.private_calls
FOR EACH ROW
EXECUTE FUNCTION public.private_calls_guard_server_columns();

COMMENT ON FUNCTION public.private_calls_guard_server_columns IS
  'Honest-private-call BE-P0-2: blocks direct client writes to lifecycle / billing columns on private_calls. Bypasses for service_role + SECURITY DEFINER RPCs.';