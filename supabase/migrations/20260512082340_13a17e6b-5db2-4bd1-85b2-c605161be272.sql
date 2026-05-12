
-- Pkg32: Switch agency commission from per-gift triggers to scheduled weekly distribution

-- 1. Drop per-gift / per-call commission triggers (functions kept for rollback)
DROP TRIGGER IF EXISTS trigger_auto_agency_commission ON public.gift_transactions;
DROP TRIGGER IF EXISTS trigger_auto_agency_commission_call ON public.private_calls;

-- 2. Add commission_processed_at to track which transfers have been distributed
ALTER TABLE public.agency_earnings_transfers
  ADD COLUMN IF NOT EXISTS commission_processed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_agency_earnings_transfers_unprocessed
  ON public.agency_earnings_transfers (created_at)
  WHERE commission_processed_at IS NULL;

-- 3. Scheduled commission distribution RPC
CREATE OR REPLACE FUNCTION public.process_agency_commission_distribution(
  _since TIMESTAMPTZ DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _t RECORD;
  _own_rate numeric;
  _own_commission bigint;
  _parent_id uuid;
  _parent_rate numeric;
  _bonus_rate numeric;
  _bonus_amount bigint;
  _child_rate numeric;
  _depth int;
  _agencies_credited int := 0;
  _own_total bigint := 0;
  _bonus_total bigint := 0;
  _bonus_count int := 0;
  _processed int := 0;
  _cutoff TIMESTAMPTZ;
BEGIN
  _cutoff := COALESCE(_since, now() - interval '90 days');

  PERFORM set_config('app.bypass_profile_protection', 'true', true);

  FOR _t IN
    SELECT id, agency_id, host_id, amount, created_at
    FROM public.agency_earnings_transfers
    WHERE commission_processed_at IS NULL
      AND status = 'completed'
      AND created_at >= _cutoff
      AND amount > 0
    ORDER BY created_at
    FOR UPDATE SKIP LOCKED
  LOOP
    _processed := _processed + 1;

    -- 3a. Own agency commission
    _own_rate := public.resolve_agency_commission_rate(_t.agency_id);
    IF _own_rate IS NULL OR _own_rate < 0 OR _own_rate > 100 THEN
      CONTINUE;
    END IF;

    _own_commission := FLOOR(_t.amount::numeric * _own_rate / 100.0)::bigint;
    IF _own_commission > 0 THEN
      INSERT INTO public.agency_commission_history (
        agency_id, host_id, transaction_type, original_amount,
        commission_rate, commission_amount, source_transaction_id, notes
      ) VALUES (
        _t.agency_id, _t.host_id, 'weekly_distribution', _t.amount,
        _own_rate, _own_commission, _t.id,
        'Scheduled weekly commission on transferred beans'
      )
      ON CONFLICT (source_transaction_id, transaction_type) DO NOTHING;

      IF FOUND THEN
        UPDATE public.agencies
          SET beans_balance = COALESCE(beans_balance, 0) + _own_commission,
              updated_at = now()
          WHERE id = _t.agency_id;
        _own_total := _own_total + _own_commission;
        _agencies_credited := _agencies_credited + 1;
      END IF;
    END IF;

    -- 3b. Parent chain referral bonus (paid by company)
    _child_rate := _own_rate;
    _depth := 0;
    SELECT parent_agency_id INTO _parent_id FROM public.agencies WHERE id = _t.agency_id;

    WHILE _parent_id IS NOT NULL AND _depth < 5 LOOP
      _depth := _depth + 1;
      _parent_rate := public.resolve_agency_commission_rate(_parent_id);
      IF _parent_rate IS NULL THEN
        EXIT;
      END IF;

      IF _parent_rate > _child_rate THEN
        _bonus_rate := _parent_rate - _child_rate;
        _bonus_amount := FLOOR(_t.amount::numeric * _bonus_rate / 100.0)::bigint;
        IF _bonus_amount > 0 THEN
          INSERT INTO public.agency_commission_history (
            agency_id, host_id, transaction_type, original_amount,
            commission_rate, commission_amount, source_transaction_id, notes
          ) VALUES (
            _parent_id, _t.host_id, 'upper_referral_bonus', _t.amount,
            _bonus_rate, _bonus_amount, _t.id,
            'Upper agency referral bonus (depth ' || _depth || ')'
          )
          ON CONFLICT (source_transaction_id, transaction_type) DO NOTHING;

          IF FOUND THEN
            UPDATE public.agencies
              SET beans_balance = COALESCE(beans_balance, 0) + _bonus_amount,
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

    UPDATE public.agency_earnings_transfers
      SET commission_processed_at = now()
      WHERE id = _t.id;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'transfers_processed', _processed,
    'agencies_credited', _agencies_credited,
    'own_commission_total', _own_total,
    'upper_bonuses_count', _bonus_count,
    'upper_bonus_total', _bonus_total,
    'ran_at', now()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.process_agency_commission_distribution(TIMESTAMPTZ) TO authenticated, service_role;
