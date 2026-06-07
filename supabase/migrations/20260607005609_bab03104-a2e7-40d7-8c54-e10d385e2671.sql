
CREATE OR REPLACE FUNCTION public.bulk_credit_call_earnings(_admin_id uuid, _call_ids uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _call RECORD;
  _credited INTEGER := 0;
  _skipped INTEGER := 0;
  _host_percent DECIMAL;
  _beans_earned INTEGER;
  _is_service boolean := COALESCE(auth.role(), '') = 'service_role';
  _caller_uid uuid := auth.uid();
BEGIN
  -- D2: caller-binding. Reject if the supplied _admin_id is not the caller
  -- (unless service_role or an active admin session).
  IF NOT _is_service
     AND NOT public.is_active_admin_session()
     AND (_caller_uid IS NULL OR _caller_uid <> _admin_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: admin id must match caller');
  END IF;

  IF NOT public.is_admin(_admin_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  _host_percent := public.get_effective_host_percent();

  PERFORM set_config('app.calling_function', 'bulk_credit_call_earnings', true);
  PERFORM set_config('app.bypass_profile_protection', 'true', true);

  -- D2b: lock each candidate call row for the duration of this tx
  FOR _call IN
    SELECT *
      FROM private_calls
     WHERE id = ANY(_call_ids)
       AND status = 'ended'
     FOR UPDATE
  LOOP
    IF _call.earnings_credited IS TRUE THEN
      _skipped := _skipped + 1;
      CONTINUE;
    END IF;

    _beans_earned := COALESCE(_call.host_earned_beans, FLOOR(COALESCE(_call.total_coins_spent, 0) * _host_percent / 100));
    IF _beans_earned > 0 THEN
      UPDATE profiles
         SET beans          = COALESCE(beans, 0) + _beans_earned,
             pending_earnings = COALESCE(pending_earnings, 0) + _beans_earned,
             total_earnings = COALESCE(total_earnings, 0) + _beans_earned
       WHERE id = _call.host_id;

      UPDATE private_calls
         SET host_earned_beans = _beans_earned,
             earnings_credited = true
       WHERE id = _call.id;

      -- D2 audit attribution
      BEGIN
        INSERT INTO public.balance_audit_log (
          user_id, change_type, amount, currency, source, source_id, performed_by, notes
        ) VALUES (
          _call.host_id, 'credit', _beans_earned, 'beans',
          'bulk_credit_call_earnings', _call.id, _admin_id,
          'Bulk admin credit of private-call earnings'
        );
      EXCEPTION WHEN OTHERS THEN NULL;
      END;

      _credited := _credited + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'credited', _credited, 'skipped', _skipped);
END;
$function$;

-- Defense-in-depth: revoke anon (already false but make explicit)
REVOKE EXECUTE ON FUNCTION public.bulk_credit_call_earnings(uuid, uuid[]) FROM anon, PUBLIC;
