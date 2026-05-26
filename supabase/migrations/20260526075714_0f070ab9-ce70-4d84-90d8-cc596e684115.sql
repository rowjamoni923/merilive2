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
  _solo_count integer := 0;
  _total_host_paid_personal numeric := 0;
  _total_to_agency_wallet numeric := 0;
  _total_direct_commission numeric := 0;
  _total_upper_commission numeric := 0;
  _period_start timestamp;
  _period_end timestamp;
  _direct_rate numeric;
  _parent_rate numeric;
  _direct_share bigint;
  _upper_delta numeric;
  _upper_share bigint;
  _host_earning bigint;
BEGIN
  _period_start := date_trunc('week', now() - interval '7 days');
  _period_end   := date_trunc('week', now());

  -- Path A: hosts attached to an active agency
  -- Host earnings + agency commission ALL go to agency.wallet_balance (Total Beans / withdrawal pool)
  -- Host's personal My Beans (profiles.beans) is NEVER credited from this transfer.
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
    _host_earning := _host.pending;
    _direct_rate  := _host.commission_rate;
    _direct_share := FLOOR(_host_earning::numeric * _direct_rate / 100.0)::bigint;

    -- 1. Clear host's pending_earnings + weekly_earnings. DO NOT credit profiles.beans.
    PERFORM set_config('app.bypass_profile_protection', 'true', true);
    UPDATE public.profiles
       SET pending_earnings = 0,
           weekly_earnings  = 0,
           updated_at = now()
     WHERE id = _host.id;
    PERFORM set_config('app.bypass_profile_protection', 'false', true);

    -- 2. Credit the host's gross earnings into the agency's withdrawable wallet
    UPDATE public.agencies
       SET wallet_balance = COALESCE(wallet_balance, 0) + _host_earning,
           updated_at = now()
     WHERE id = _host.agency_id;

    INSERT INTO public.agency_earnings_transfers (
      agency_id, host_id, host_name, host_uid, amount,
      commission_rate, transfer_type, status,
      period_start, period_end, agency_name, notes
    )
    VALUES (
      _host.agency_id, _host.id, _host.display_name, _host.app_uid,
      _host_earning, 0, 'weekly_auto', 'completed',
      _period_start, _period_end, _host.agency_name,
      'Weekly host earnings transferred to agency wallet (Total Beans).'
    );

    _total_to_agency_wallet := _total_to_agency_wallet + _host_earning;

    -- 3. Direct agency commission (company-paid bonus on top, into same wallet)
    IF _direct_share > 0 THEN
      UPDATE public.agencies
         SET wallet_balance = COALESCE(wallet_balance, 0) + _direct_share,
             updated_at = now()
       WHERE id = _host.agency_id;

      INSERT INTO public.agency_earnings_transfers (
        agency_id, host_id, host_name, host_uid, amount,
        commission_rate, transfer_type, status,
        period_start, period_end, agency_name, notes
      )
      VALUES (
        _host.agency_id, _host.id, _host.display_name, _host.app_uid,
        _direct_share, _direct_rate, 'weekly_commission', 'completed',
        _period_start, _period_end, _host.agency_name,
        'Agency commission on host earnings (company-paid, into Total Beans).'
      );

      _total_direct_commission := _total_direct_commission + _direct_share;
    END IF;

    -- 4. Upper (parent) agency override commission
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
          _upper_share := FLOOR(_host_earning::numeric * _upper_delta / 100.0)::bigint;

          IF _upper_share > 0 THEN
            UPDATE public.agencies
               SET wallet_balance = COALESCE(wallet_balance, 0) + _upper_share,
                   updated_at = now()
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
              'Upper-agency override commission (company-paid, into Total Beans).'
            );

            _total_upper_commission := _total_upper_commission + _upper_share;
          END IF;
        END IF;
      END IF;
    END IF;

    _transfer_count := _transfer_count + 1;
  END LOOP;

  -- Path B: solo hosts (no active agency attachment) — keep legacy behaviour:
  -- pending_earnings → personal My Beans (profiles.beans). No agency commission.
  FOR _host IN
    SELECT p.id, COALESCE(p.pending_earnings, 0)::bigint AS pending
      FROM public.profiles p
     WHERE COALESCE(p.pending_earnings, 0) > 0
       AND NOT EXISTS (
         SELECT 1 FROM public.agency_hosts ah
          JOIN public.agencies a ON a.id = ah.agency_id AND a.is_active = true
         WHERE ah.host_id = p.id AND ah.status = 'active'
       )
  LOOP
    PERFORM set_config('app.bypass_profile_protection', 'true', true);
    UPDATE public.profiles
       SET beans = COALESCE(beans, 0) + _host.pending,
           pending_earnings = 0,
           weekly_earnings  = 0,
           updated_at = now()
     WHERE id = _host.id;
    PERFORM set_config('app.bypass_profile_protection', 'false', true);

    _total_host_paid_personal := _total_host_paid_personal + _host.pending;
    _solo_count := _solo_count + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'agency_hosts_processed', _transfer_count,
    'solo_hosts_processed', _solo_count,
    'total_to_agency_wallet', _total_to_agency_wallet,
    'total_direct_agency_commission', _total_direct_commission,
    'total_upper_agency_commission', _total_upper_commission,
    'total_paid_to_solo_hosts_personal_beans', _total_host_paid_personal,
    'period_start', _period_start,
    'period_end', _period_end,
    'note', 'Agency hosts: host earnings + commission go to agency.wallet_balance (Total Beans, withdrawable). Solo hosts: earnings credited to personal beans (My Beans).'
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.process_weekly_agency_transfers() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_weekly_agency_transfers() TO service_role;