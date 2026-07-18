
CREATE OR REPLACE FUNCTION public.process_agency_commission_distribution(_since timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _bucket RECORD;
  _group_usd numeric;
  _own_rate numeric;
  _own_level text;
  _own_commission bigint;
  _parent_id uuid;
  _parent_rate numeric;
  _parent_level text;
  _bonus_rate numeric;
  _bonus_amount bigint;
  _child_rate numeric;
  _beans_per_usd numeric;
  _agencies_credited int := 0;
  _own_total bigint := 0;
  _bonus_total bigint := 0;
  _bonus_count int := 0;
  _hop int;
  _scheduler_bypass boolean;
BEGIN
  BEGIN
    _scheduler_bypass := COALESCE(current_setting('app.commission_scheduler', true), '') = 'true';
  EXCEPTION WHEN OTHERS THEN _scheduler_bypass := false; END;

  IF NOT _scheduler_bypass
     AND COALESCE(auth.role(),'') <> 'service_role'
     AND NOT public.is_active_admin_session() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  _beans_per_usd := public.get_beans_per_usd();

  FOR _bucket IN
    SELECT agency_id, date_trunc('week', created_at)::date AS period_start, SUM(amount)::bigint AS total_beans
    FROM public.agency_earnings_transfers
    WHERE commission_processed_at IS NULL
      AND status = 'completed'
      AND transfer_type = 'weekly_auto'
      AND (_since IS NULL OR created_at >= _since)
    GROUP BY agency_id, date_trunc('week', created_at)::date
  LOOP
    -- Own commission: rate from admin-configured tier table, no hardcoded overrides.
    _group_usd := public.get_agency_group_volume_usd(_bucket.agency_id, _bucket.period_start);
    SELECT level_code, commission_rate INTO _own_level, _own_rate
    FROM public.get_agency_tier_rate_for_usd(_group_usd);

    IF COALESCE(_own_rate, 0) > 0 THEN
      _own_commission := FLOOR(_bucket.total_beans::numeric * _own_rate / 100.0)::bigint;

      INSERT INTO public.agency_commission_history (
        agency_id, transaction_type, original_amount, commission_rate, commission_amount, period_start, notes
      ) VALUES (
        _bucket.agency_id, 'weekly_aggregate', _bucket.total_beans, _own_rate, _own_commission, _bucket.period_start,
        format('Weekly Team Vol: $%s. Tier: %s', _group_usd, COALESCE(_own_level, 'n/a'))
      ) ON CONFLICT DO NOTHING;

      IF FOUND THEN
        PERFORM set_config('app.bypass_agency_economy_guard', 'true', true);
        UPDATE public.agencies SET wallet_balance = COALESCE(wallet_balance, 0) + _own_commission WHERE id = _bucket.agency_id;
        PERFORM set_config('app.bypass_agency_economy_guard', 'false', true);
        _own_total := _own_total + _own_commission;
        _agencies_credited := _agencies_credited + 1;
      END IF;
    END IF;

    -- Multi-hop referral bonus: each parent gets (parent_rate - immediate_child_rate),
    -- only when strictly positive (upper level higher than sub level). Same or lower → 0.
    _child_rate := COALESCE(_own_rate, 0);
    SELECT parent_agency_id INTO _parent_id FROM public.agencies WHERE id = _bucket.agency_id;
    _hop := 0;

    WHILE _parent_id IS NOT NULL AND _hop < 5 LOOP
      _hop := _hop + 1;
      DECLARE
        _p_group_usd numeric;
      BEGIN
        _p_group_usd := public.get_agency_group_volume_usd(_parent_id, _bucket.period_start);
        SELECT level_code, commission_rate INTO _parent_level, _parent_rate
        FROM public.get_agency_tier_rate_for_usd(_p_group_usd);
      END;

      _bonus_rate := COALESCE(_parent_rate, 0) - COALESCE(_child_rate, 0);

      IF _bonus_rate > 0 THEN
        _bonus_amount := FLOOR(_bucket.total_beans::numeric * _bonus_rate / 100.0)::bigint;

        INSERT INTO public.agency_commission_history (
          agency_id, transaction_type, original_amount, commission_rate, commission_amount, period_start, notes
        ) VALUES (
          _parent_id, 'upper_referral_bonus', _bucket.total_beans, _bonus_rate, _bonus_amount, _bucket.period_start,
          format('Override from sub-agency. Parent tier %s (%s%%) - Child tier %s (%s%%) = %s%%',
                 COALESCE(_parent_level,'n/a'), _parent_rate,
                 COALESCE(_own_level,'n/a'), _child_rate, _bonus_rate)
        ) ON CONFLICT DO NOTHING;

        IF FOUND THEN
          PERFORM set_config('app.bypass_agency_economy_guard', 'true', true);
          UPDATE public.agencies SET wallet_balance = COALESCE(wallet_balance, 0) + _bonus_amount WHERE id = _parent_id;
          PERFORM set_config('app.bypass_agency_economy_guard', 'false', true);
          _bonus_total := _bonus_total + _bonus_amount;
          _bonus_count := _bonus_count + 1;
        END IF;
      END IF;

      -- Advance up the chain: next parent's child = current parent's rate (proper pairwise diff).
      _child_rate := COALESCE(_parent_rate, _child_rate);
      SELECT parent_agency_id INTO _parent_id FROM public.agencies WHERE id = _parent_id;
    END LOOP;

    UPDATE public.agency_earnings_transfers
    SET commission_processed_at = now()
    WHERE agency_id = _bucket.agency_id
      AND date_trunc('week', created_at)::date = _bucket.period_start
      AND transfer_type = 'weekly_auto'
      AND commission_processed_at IS NULL;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'agencies_credited', _agencies_credited,
    'own_commission_total', _own_total,
    'upper_bonus_total', _bonus_total,
    'upper_bonuses_count', _bonus_count
  );
END;
$function$;
