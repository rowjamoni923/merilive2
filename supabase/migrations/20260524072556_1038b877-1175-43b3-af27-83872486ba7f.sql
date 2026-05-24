-- Section #8 follow-up: make the agency economy guard compatible with SECURITY DEFINER backend jobs.

CREATE OR REPLACE FUNCTION public.guard_agency_economy_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_is_privileged_db_role boolean := current_user IN ('postgres', 'service_role', 'supabase_admin');
  v_is_admin boolean := COALESCE(public.is_admin(auth.uid()), false) OR COALESCE(public.is_active_admin_session(), false);
  v_bypass boolean := COALESCE(current_setting('app.bypass_agency_economy_guard', true), '') = 'true';
  v_changed_fields text[] := ARRAY[]::text[];
BEGIN
  IF TG_OP <> 'UPDATE' THEN
    RETURN NEW;
  END IF;

  IF NEW.wallet_balance IS DISTINCT FROM OLD.wallet_balance THEN
    v_changed_fields := array_append(v_changed_fields, 'wallet_balance');
  END IF;
  IF NEW.beans_balance IS DISTINCT FROM OLD.beans_balance THEN
    v_changed_fields := array_append(v_changed_fields, 'beans_balance');
  END IF;
  IF NEW.diamond_balance IS DISTINCT FROM OLD.diamond_balance THEN
    v_changed_fields := array_append(v_changed_fields, 'diamond_balance');
  END IF;
  IF NEW.commission_rate IS DISTINCT FROM OLD.commission_rate THEN
    v_changed_fields := array_append(v_changed_fields, 'commission_rate');
  END IF;
  IF NEW.level IS DISTINCT FROM OLD.level THEN
    v_changed_fields := array_append(v_changed_fields, 'level');
  END IF;

  IF array_length(v_changed_fields, 1) IS NULL THEN
    RETURN NEW;
  END IF;

  -- Direct client updates run as anon/authenticated. Secure RPCs/jobs owned by postgres
  -- and service-role/admin operations remain allowed.
  IF v_bypass OR v_is_privileged_db_role OR v_is_admin THEN
    RETURN NEW;
  END IF;

  BEGIN
    INSERT INTO public.security_events (event_type, severity, user_id, metadata, created_at)
    VALUES (
      'blocked_agency_economy_tamper',
      'critical',
      auth.uid(),
      jsonb_build_object(
        'agency_id', OLD.id,
        'changed_fields', v_changed_fields,
        'old_wallet_balance', OLD.wallet_balance,
        'new_wallet_balance', NEW.wallet_balance,
        'old_beans_balance', OLD.beans_balance,
        'new_beans_balance', NEW.beans_balance,
        'old_diamond_balance', OLD.diamond_balance,
        'new_diamond_balance', NEW.diamond_balance
      ),
      now()
    );
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RAISE EXCEPTION 'Agency economy fields cannot be changed directly';
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_agency_economy_fields ON public.agencies;
CREATE TRIGGER trg_guard_agency_economy_fields
BEFORE UPDATE ON public.agencies
FOR EACH ROW
EXECUTE FUNCTION public.guard_agency_economy_fields();