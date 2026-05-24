
CREATE OR REPLACE FUNCTION public.process_weekly_agency_transfers()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _host RECORD;
  _parent RECORD;
  _transfer_count integer := 0;
  _total_host_paid numeric := 0;
  _total_direct_commission numeric := 0;
  _total_upper_commission numeric := 0;
  _period_start timestamp;
  _period_end timestamp;
  _direct_rate numeric;
  _parent_rate numeric;
  _direct_share bigint;
  _upper_delta numeric;
  _upper_share bigint;
BEGIN
  _period_start := date_trunc('week', now() - interval '7 days');
  _period_end   := date_trunc('week', now());

  FOR _host IN
    SELECT p.id, p.display_name, p.app_uid,
           ah.agency_id, a.name AS agency_name,
           a.parent_agency_id,
           LEAST(100, GREATEST(0, COALESCE(a.commission_rate, 3)))::numeric AS commission_rate,
           COALESCE(p.pending_earnings, 0)::bigint AS pending
      FROM public.profiles p
      JOIN public.agency_hosts ah ON ah.host_id = p.id AND ah.status = 'active'
      JOIN public.agencies a      ON a.id = ah.agency_id AND a.is_active = true
     WHERE COALESCE(p.pending_earnings, 0) > 0
  LOOP
    _direct_rate  := _host.commission_rate;
    _direct_share := FLOOR(_host.pending::numeric * _direct_rate / 100.0)::bigint;

    -- 1. Host keeps 100% of pending earnings (no commission deducted)
    PERFORM set_config('app.bypass_profile_protection', 'true', true);
    UPDATE public.profiles
       SET beans = COALESCE(beans, 0) + _host.pending,
           pending_earnings = 0,
           weekly_earnings  = 0,
           updated_at = now()
     WHERE id = _host.id;
    PERFORM set_config('app.bypass_profile_protection', 'false', true);

    -- 2. Direct agency commission (paid by COMPANY, not by host)
    IF _direct_share > 0 THEN
      UPDATE public.agencies
         SET beans_balance = COALESCE(beans_balance, 0) + _direct_share
       WHERE id = _host.agency_id;

      INSERT INTO public.agency_earnings_transfers (
        agency_id, host_id, host_name, host_uid, amount,
        commission_rate, transfer_type, status,
        period_start, period_end, agency_name, notes
      )
      VALUES (
        _host.agency_id, _host.id, _host.display_name, _host.app_uid,
        _direct_share, _direct_rate, 'weekly_auto', 'completed',
        _period_start, _period_end, _host.agency_name,
        'Direct agency commission on own host earnings (company-paid).'
      );

      _total_direct_commission := _total_direct_commission + _direct_share;
    END IF;

    -- 3. Upper (parent) agency override — ONLY if parent rate > direct rate
    IF _host.parent_agency_id IS NOT NULL THEN
      SELECT id, name,
             LEAST(100, GREATEST(0, COALESCE(commission_rate, 0)))::numeric AS rate,
             is_active
        INTO _parent
        FROM public.agencies
       WHERE id = _host.parent_agency_id;

      IF FOUND AND _parent.is_active THEN
        _parent_rate := _parent.rate;
        IF _parent_rate > _direct_rate THEN
          _upper_delta := _parent_rate - _direct_rate;
          _upper_share := FLOOR(_host.pending::numeric * _upper_delta / 100.0)::bigint;

          IF _upper_share > 0 THEN
            UPDATE public.agencies
               SET beans_balance = COALESCE(beans_balance, 0) + _upper_share
             WHERE id = _parent.id;

            INSERT INTO public.agency_earnings_transfers (
              agency_id, host_id, host_name, host_uid, amount,
              commission_rate, transfer_type, status,
              period_start, period_end, agency_name, notes
            )
            VALUES (
              _parent.id, _host.id, _host.display_name, _host.app_uid,
              _upper_share, _upper_delta, 'weekly_override', 'completed',
              _period_start, _period_end, _parent.name,
              'Upper-agency override commission (company-paid, delta over sub-agency rate). Sub-agency balance untouched.'
            );

            _total_upper_commission := _total_upper_commission + _upper_share;
          END IF;
        END IF;
      END IF;
    END IF;

    _transfer_count := _transfer_count + 1;
    _total_host_paid := _total_host_paid + _host.pending;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'hosts_processed', _transfer_count,
    'total_paid_to_hosts', _total_host_paid,
    'total_direct_agency_commission', _total_direct_commission,
    'total_upper_agency_commission', _total_upper_commission,
    'period_start', _period_start,
    'period_end', _period_end,
    'note', 'All agency commissions are company-paid. Host and sub-agency balances are never reduced to pay any agency commission.'
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.process_weekly_agency_transfers() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_weekly_agency_transfers() TO service_role;
