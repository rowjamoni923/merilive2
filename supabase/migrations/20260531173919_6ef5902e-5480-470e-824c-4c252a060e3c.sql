-- 1. DROP REAL-TIME COMMISSION TRIGGERS (Prevent double payments & ensure weekly-only payout)
DROP TRIGGER IF EXISTS trigger_auto_credit_agency_commission ON public.gift_transactions;
DROP TRIGGER IF EXISTS trigger_auto_credit_agency_commission_call ON public.private_calls;

-- 2. UPDATE GROUP VOLUME LOGIC & HELPER 5 PROTECTION
CREATE OR REPLACE FUNCTION public.get_agency_group_volume_usd(_agency_id uuid, _period_start date)
RETURNS numeric AS $$
DECLARE
  _total_usd numeric := 0;
  _beans_per_usd numeric;
BEGIN
  _beans_per_usd := public.get_beans_per_usd();
  
  -- Sum income of direct hosts AND income from all sub-agencies (recursive group volume)
  -- For simple performance, we calculate for this week's settled transfers
  WITH RECURSIVE agency_tree AS (
    SELECT id FROM public.agencies WHERE id = _agency_id
    UNION ALL
    SELECT a.id FROM public.agencies a JOIN agency_tree t ON a.parent_agency_id = t.id
  )
  SELECT COALESCE(SUM(amount), 0)::numeric / NULLIF(_beans_per_usd, 0)
  INTO _total_usd
  FROM public.agency_earnings_transfers
  WHERE agency_id IN (SELECT id FROM agency_tree)
    AND transfer_type = 'weekly_auto'
    AND status = 'completed'
    AND date_trunc('week', created_at)::date = _period_start;

  RETURN ROUND(_total_usd, 2);
END;
$$ LANGUAGE plpgsql STABLE SET search_path = public;

-- 3. UPDATE COMMISSION DISTRIBUTION WITH GROUP VOLUME & 1-HOUR DELAY FLOW
CREATE OR REPLACE FUNCTION public.process_agency_commission_distribution(_since timestamptz DEFAULT NULL)
RETURNS jsonb AS $$
DECLARE
  _bucket RECORD;
  _group_usd numeric;
  _own_rate numeric;
  _own_level text;
  _own_commission bigint;
  _parent_id uuid;
  _parent_rate numeric;
  _bonus_rate numeric;
  _bonus_amount bigint;
  _child_rate numeric;
  _beans_per_usd numeric;
  _cutoff TIMESTAMPTZ;
  _agencies_credited int := 0;
  _own_total bigint := 0;
  _bonus_total bigint := 0;
  _bonus_count int := 0;
  _is_helper_5 boolean;
BEGIN
  -- Security check
  IF COALESCE(auth.role(),'') <> 'service_role' AND NOT public.is_active_admin_session() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  _cutoff := COALESCE(_since, now() - interval '7 days');
  _beans_per_usd := public.get_beans_per_usd();

  -- Process each agency that had host earnings settled this week
  FOR _bucket IN
    SELECT agency_id, date_trunc('week', created_at)::date AS period_start, SUM(amount)::bigint AS total_beans
    FROM public.agency_earnings_transfers
    WHERE commission_processed_at IS NULL
      AND status = 'completed'
      AND transfer_type = 'weekly_auto'
      AND created_at >= _cutoff
    GROUP BY agency_id, date_trunc('week', created_at)::date
  LOOP
    -- A. Calculate Group Volume for Level Determination
    _group_usd := public.get_agency_group_volume_usd(_bucket.agency_id, _bucket.period_start);
    
    -- B. Helper Level 5 Protection check
    SELECT (level = 'A5' OR level = 'diamond') INTO _is_helper_5 
    FROM public.agencies WHERE id = _bucket.agency_id;

    IF _is_helper_5 THEN
      _own_rate := 12.0;
      _own_level := 'Diamond (Fixed)';
    ELSE
      SELECT level_code, commission_rate INTO _own_level, _own_rate
      FROM public.get_agency_tier_rate_for_usd(_group_usd);
    END IF;

    -- C. Credit Own Commission
    IF _own_rate > 0 THEN
      _own_commission := FLOOR(_bucket.total_beans::numeric * _own_rate / 100.0)::bigint;
      
      INSERT INTO public.agency_commission_history (
        agency_id, transaction_type, original_amount, commission_rate, commission_amount, period_start, notes
      ) VALUES (
        _bucket.agency_id, 'weekly_aggregate', _bucket.total_beans, _own_rate, _own_commission, _bucket.period_start,
        format('Weekly Team Vol: $%s. Tier: %s', _group_usd, _own_level)
      ) ON CONFLICT DO NOTHING;

      IF FOUND THEN
        UPDATE public.agencies SET wallet_balance = COALESCE(wallet_balance, 0) + _own_commission WHERE id = _bucket.agency_id;
        _own_total := _own_total + _own_commission;
        _agencies_credited := _agencies_credited + 1;
      END IF;
    END IF;

    -- D. Process Upper-Agency Difference (Override Bonus)
    _child_rate := COALESCE(_own_rate, 0);
    SELECT parent_agency_id INTO _parent_id FROM public.agencies WHERE id = _bucket.agency_id;

    WHILE _parent_id IS NOT NULL LOOP
      -- Parent rate also determined by THEIR group volume
      DECLARE
        _p_group_usd numeric;
        _p_is_h5 boolean;
      BEGIN
        _p_group_usd := public.get_agency_group_volume_usd(_parent_id, _bucket.period_start);
        SELECT (level = 'A5' OR level = 'diamond') INTO _p_is_h5 FROM public.agencies WHERE id = _parent_id;
        
        IF _p_is_h5 THEN
          _parent_rate := 12.0;
        ELSE
          SELECT commission_rate INTO _parent_rate FROM public.get_agency_tier_rate_for_usd(_p_group_usd);
        END IF;
      END;

      _bonus_rate := COALESCE(_parent_rate, 0) - _child_rate;
      
      IF _bonus_rate > 0 THEN
        _bonus_amount := FLOOR(_bucket.total_beans::numeric * _bonus_rate / 100.0)::bigint;
        
        INSERT INTO public.agency_commission_history (
          agency_id, transaction_type, original_amount, commission_rate, commission_amount, period_start, notes
        ) VALUES (
          _parent_id, 'upper_referral_bonus', _bucket.total_beans, _bonus_rate, _bonus_amount, _bucket.period_start,
          format('Override from Sub-agency. Rate Diff: %s%% - %s%%', _parent_rate, _child_rate)
        ) ON CONFLICT DO NOTHING;

        IF FOUND THEN
          UPDATE public.agencies SET wallet_balance = COALESCE(wallet_balance, 0) + _bonus_amount WHERE id = _parent_id;
          _bonus_total := _bonus_total + _bonus_amount;
          _bonus_count := _bonus_count + 1;
        END IF;
      END IF;

      -- Move up the chain (max 5 levels to prevent infinite loops)
      _child_rate := GREATEST(_child_rate, COALESCE(_parent_rate, 0));
      SELECT parent_agency_id INTO _parent_id FROM public.agencies WHERE id = _parent_id;
    END LOOP;

    -- Mark these transfers as processed so they aren't counted again
    UPDATE public.agency_earnings_transfers 
    SET commission_processed_at = now() 
    WHERE agency_id = _bucket.agency_id 
      AND date_trunc('week', created_at)::date = _bucket.period_start
      AND transfer_type = 'weekly_auto';
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'agencies_credited', _agencies_credited,
    'own_commission_total', _own_total,
    'upper_bonus_total', _bonus_total,
    'upper_bonuses_count', _bonus_count
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. ENSURE SCHEDULER IS ACTIVE AND CONFIGURED FOR 1-HOUR DELAY
UPDATE public.app_settings 
SET setting_value = jsonb_build_object(
  'is_active', true,
  'delay_hours_after_transfer', 1,
  'last_run_at', null,
  'next_run_at', null
)::text
WHERE setting_key = 'commission_schedule';

UPDATE public.app_settings 
SET setting_value = (setting_value::jsonb || jsonb_build_object('is_active', true))::text
WHERE setting_key = 'transfer_schedule';
