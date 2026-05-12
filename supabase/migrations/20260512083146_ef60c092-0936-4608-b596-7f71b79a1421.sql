
-- Pkg34: Weekly aggregated commission + admin adjustment

-- 1. Add period_start to history for weekly grouping
ALTER TABLE public.agency_commission_history
  ADD COLUMN IF NOT EXISTS period_start DATE,
  ADD COLUMN IF NOT EXISTS adjusted_by UUID;

-- Partial unique: one weekly_aggregate / upper_referral_bonus per (agency, week)
CREATE UNIQUE INDEX IF NOT EXISTS uq_agency_commission_weekly
  ON public.agency_commission_history (agency_id, transaction_type, period_start)
  WHERE period_start IS NOT NULL
    AND transaction_type IN ('weekly_aggregate', 'upper_referral_bonus');

-- 2. Tier lookup by USD
CREATE OR REPLACE FUNCTION public.get_agency_tier_rate_for_usd(_usd numeric)
RETURNS TABLE(level_code text, level_name text, commission_rate numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT t.level_code, t.level_name, t.commission_rate
  FROM public.agency_level_tiers t
  WHERE t.is_active = true
    AND COALESCE(_usd, 0) >= COALESCE(t.min_weekly_income, 0)
    AND (t.max_weekly_income IS NULL OR COALESCE(_usd, 0) < t.max_weekly_income)
  ORDER BY t.display_order DESC
  LIMIT 1;
$$;

-- 3. Helper: read beans→USD divisor (no fallback)
CREATE OR REPLACE FUNCTION public.get_beans_per_usd()
RETURNS numeric
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _v numeric;
BEGIN
  SELECT (setting_value::jsonb ->> 'rate')::numeric INTO _v
  FROM public.app_settings WHERE setting_key = 'beans_to_usd_rate' LIMIT 1;
  IF _v IS NULL OR _v <= 0 THEN
    RAISE EXCEPTION 'beans_to_usd_rate not configured';
  END IF;
  RETURN _v;
END;
$$;

-- 4. Rewrite distribution: aggregate per (agency, week_bucket)
CREATE OR REPLACE FUNCTION public.process_agency_commission_distribution(
  _since TIMESTAMPTZ DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  _bucket RECORD;
  _agency_total bigint;
  _usd numeric;
  _own_rate numeric;
  _own_level text;
  _own_commission bigint;
  _parent_id uuid;
  _parent_usd numeric;
  _parent_rate numeric;
  _parent_level text;
  _bonus_rate numeric;
  _bonus_amount bigint;
  _child_rate numeric;
  _depth int;
  _beans_per_usd numeric;
  _cutoff TIMESTAMPTZ;
  _agencies_credited int := 0;
  _own_total bigint := 0;
  _bonus_total bigint := 0;
  _bonus_count int := 0;
  _buckets_processed int := 0;
BEGIN
  _cutoff := COALESCE(_since, now() - interval '90 days');
  _beans_per_usd := public.get_beans_per_usd();

  PERFORM set_config('app.bypass_profile_protection', 'true', true);

  -- One row per (agency, week_bucket) with unprocessed transfers
  FOR _bucket IN
    SELECT
      agency_id,
      date_trunc('week', created_at)::date AS period_start,
      SUM(amount)::bigint AS total_beans,
      MIN(host_id) AS sample_host_id  -- unused, kept for FK happiness
    FROM public.agency_earnings_transfers
    WHERE commission_processed_at IS NULL
      AND status = 'completed'
      AND created_at >= _cutoff
      AND amount > 0
    GROUP BY agency_id, date_trunc('week', created_at)::date
  LOOP
    _buckets_processed := _buckets_processed + 1;
    _agency_total := _bucket.total_beans;
    _usd := _agency_total::numeric / _beans_per_usd;

    -- Own rate by USD tier
    SELECT level_code, commission_rate INTO _own_level, _own_rate
    FROM public.get_agency_tier_rate_for_usd(_usd);

    IF _own_rate IS NOT NULL AND _own_rate > 0 THEN
      _own_commission := FLOOR(_agency_total::numeric * _own_rate / 100.0)::bigint;
      IF _own_commission > 0 THEN
        INSERT INTO public.agency_commission_history (
          agency_id, host_id, transaction_type, original_amount,
          commission_rate, commission_amount, period_start, notes
        ) VALUES (
          _bucket.agency_id, NULL, 'weekly_aggregate', _agency_total,
          _own_rate, _own_commission, _bucket.period_start,
          'Weekly tier ' || COALESCE(_own_level,'?') || ' on $' || ROUND(_usd,2)
        )
        ON CONFLICT (agency_id, transaction_type, period_start)
          WHERE period_start IS NOT NULL
            AND transaction_type IN ('weekly_aggregate','upper_referral_bonus')
          DO NOTHING;

        IF FOUND THEN
          UPDATE public.agencies
            SET beans_balance = COALESCE(beans_balance,0) + _own_commission,
                updated_at = now()
            WHERE id = _bucket.agency_id;
          _own_total := _own_total + _own_commission;
          _agencies_credited := _agencies_credited + 1;
        END IF;
      END IF;
    END IF;

    -- Parent chain referral bonus (each parent's rate from its own weekly USD)
    _child_rate := COALESCE(_own_rate, 0);
    _depth := 0;
    SELECT parent_agency_id INTO _parent_id FROM public.agencies WHERE id = _bucket.agency_id;

    WHILE _parent_id IS NOT NULL AND _depth < 5 LOOP
      _depth := _depth + 1;

      -- Parent's own weekly USD across all its hosts in same week
      SELECT COALESCE(SUM(amount),0)::numeric / _beans_per_usd
        INTO _parent_usd
      FROM public.agency_earnings_transfers
      WHERE agency_id = _parent_id
        AND status = 'completed'
        AND date_trunc('week', created_at)::date = _bucket.period_start;

      SELECT level_code, commission_rate INTO _parent_level, _parent_rate
      FROM public.get_agency_tier_rate_for_usd(_parent_usd);

      IF _parent_rate IS NOT NULL AND _parent_rate > _child_rate THEN
        _bonus_rate := _parent_rate - _child_rate;
        _bonus_amount := FLOOR(_agency_total::numeric * _bonus_rate / 100.0)::bigint;
        IF _bonus_amount > 0 THEN
          INSERT INTO public.agency_commission_history (
            agency_id, host_id, transaction_type, original_amount,
            commission_rate, commission_amount, period_start, notes
          ) VALUES (
            _parent_id, NULL, 'upper_referral_bonus', _agency_total,
            _bonus_rate, _bonus_amount, _bucket.period_start,
            'Upper bonus depth ' || _depth || ' (parent tier ' || COALESCE(_parent_level,'?') || ')'
          )
          ON CONFLICT (agency_id, transaction_type, period_start)
            WHERE period_start IS NOT NULL
              AND transaction_type IN ('weekly_aggregate','upper_referral_bonus')
            DO NOTHING;

          IF FOUND THEN
            UPDATE public.agencies
              SET beans_balance = COALESCE(beans_balance,0) + _bonus_amount,
                  updated_at = now()
              WHERE id = _parent_id;
            _bonus_total := _bonus_total + _bonus_amount;
            _bonus_count := _bonus_count + 1;
          END IF;
        END IF;
        _child_rate := _parent_rate;
      END IF;

      SELECT parent_agency_id INTO _parent_id FROM public.agencies WHERE id = _parent_id;
    END LOOP;

    -- Mark every transfer in this (agency, week) as processed
    UPDATE public.agency_earnings_transfers
      SET commission_processed_at = now()
      WHERE agency_id = _bucket.agency_id
        AND date_trunc('week', created_at)::date = _bucket.period_start
        AND commission_processed_at IS NULL;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'buckets_processed', _buckets_processed,
    'agencies_credited', _agencies_credited,
    'own_commission_total', _own_total,
    'upper_bonuses_count', _bonus_count,
    'upper_bonus_total', _bonus_total,
    'ran_at', now()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.process_agency_commission_distribution(TIMESTAMPTZ) TO authenticated, service_role;

-- 5. Admin manual adjustment (plus or minus)
CREATE OR REPLACE FUNCTION public.admin_adjust_agency_commission(
  _agency_id uuid,
  _delta_beans bigint,
  _reason text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  _admin_id uuid;
  _new_balance bigint;
  _row_id uuid;
BEGIN
  IF NOT public.is_active_admin_session() THEN
    RAISE EXCEPTION 'Admin session required';
  END IF;

  IF _delta_beans = 0 THEN
    RAISE EXCEPTION 'Adjustment cannot be zero';
  END IF;

  IF _reason IS NULL OR length(btrim(_reason)) < 4 THEN
    RAISE EXCEPTION 'A reason is required (min 4 chars)';
  END IF;

  _admin_id := public.current_admin_id();

  PERFORM set_config('app.bypass_profile_protection', 'true', true);

  -- Update agency balance (negative trigger blocks if it would go below zero)
  UPDATE public.agencies
    SET beans_balance = COALESCE(beans_balance,0) + _delta_beans,
        updated_at = now()
    WHERE id = _agency_id
    RETURNING beans_balance INTO _new_balance;

  IF _new_balance IS NULL THEN
    RAISE EXCEPTION 'Agency not found';
  END IF;

  INSERT INTO public.agency_commission_history (
    agency_id, host_id, transaction_type, original_amount,
    commission_rate, commission_amount, notes, adjusted_by
  ) VALUES (
    _agency_id, NULL, 'manual_adjustment', ABS(_delta_beans),
    0, _delta_beans, btrim(_reason), _admin_id
  ) RETURNING id INTO _row_id;

  RETURN jsonb_build_object(
    'success', true,
    'row_id', _row_id,
    'new_balance', _new_balance,
    'delta', _delta_beans
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_adjust_agency_commission(uuid, bigint, text) TO authenticated, service_role;
