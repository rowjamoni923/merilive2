-- Pkg324 Gifting deep audit pass-1 hardening

-- 1) Defense-in-depth: REVOKE admin-only frame gift RPC from anon/public.
--    Internal is_admin() guard already rejects non-admin callers, but the
--    function should not be reachable by unauthenticated clients at all.
REVOKE EXECUTE ON FUNCTION public.admin_gift_frame_to_user(uuid, uuid, text, timestamptz, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.admin_gift_frame_to_user(uuid, uuid, text, timestamptz, text) TO authenticated;

-- 2) Harden update_agency_performance_on_gift: a malformed
--    app_settings.beans_per_dollar value (e.g. JSON-quoted string,
--    non-numeric, etc.) was raising inside this AFTER-INSERT trigger
--    with no EXCEPTION handler, which rolled back the entire
--    gift_transactions INSERT → every gift system-wide silently failed
--    until an admin fixed the setting. Parse defensively with fallback.
CREATE OR REPLACE FUNCTION public.update_agency_performance_on_gift()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _host_agency_id uuid;
  _period_start date;
  _beans_per_dollar numeric := 9000;
  _setting_text text;
  _usd_amount numeric;
BEGIN
  IF COALESCE(NEW.receiver_beans, 0) <= 0 THEN
    RETURN NEW;
  END IF;

  SELECT agency_id INTO _host_agency_id
  FROM public.profiles
  WHERE id = NEW.receiver_id;

  IF _host_agency_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT setting_value INTO _setting_text
  FROM public.app_settings
  WHERE setting_key = 'beans_per_dollar';

  IF _setting_text IS NOT NULL AND btrim(_setting_text) <> '' THEN
    BEGIN
      -- Accept either bare numeric ("9000") or JSON-quoted ("\"9000\"")
      -- or a JSON object {"value":9000}. Fall back to 9000 on any error.
      _beans_per_dollar := CASE
        WHEN _setting_text ~ '^-?[0-9]+(\.[0-9]+)?$' THEN _setting_text::numeric
        WHEN _setting_text ~ '^"-?[0-9]+(\.[0-9]+)?"$' THEN btrim(_setting_text, '"')::numeric
        ELSE COALESCE(NULLIF((_setting_text::jsonb->>'value'), '')::numeric, 9000)
      END;
    EXCEPTION WHEN OTHERS THEN
      _beans_per_dollar := 9000;
    END;
  END IF;

  IF _beans_per_dollar IS NULL OR _beans_per_dollar <= 0 THEN
    _beans_per_dollar := 9000;
  END IF;

  _usd_amount := ROUND(COALESCE(NEW.receiver_beans, 0)::numeric / _beans_per_dollar, 2);
  IF _usd_amount <= 0 THEN
    RETURN NEW;
  END IF;

  _period_start := date_trunc('week', CURRENT_DATE)::date;

  BEGIN
    INSERT INTO public.agency_performance (agency_id, period_type, period_start, total_income, golden_host_income)
    VALUES (_host_agency_id, 'weekly', _period_start, _usd_amount, _usd_amount)
    ON CONFLICT (agency_id, period_type, period_start)
    DO UPDATE SET
      total_income = agency_performance.total_income + _usd_amount,
      golden_host_income = agency_performance.golden_host_income + _usd_amount,
      updated_at = now();
  EXCEPTION WHEN OTHERS THEN
    -- Never let agency-performance bookkeeping break the gift transaction.
    NULL;
  END;

  RETURN NEW;
END;
$function$;