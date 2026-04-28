-- =====================================================
-- Pkg27: Upper Agency Referral Bonus (Level-Difference Model)
-- =====================================================
-- Logic:
--   1. Each agency (parent OR sub) earns its OWN level rate% from its own hosts
--      (no deduction from anyone else — both are equal owners)
--   2. Upper agency receives a BONUS only when sub-agent has a host that earns:
--        bonus_rate = upper_level_rate% - sub_level_rate%
--      ONLY IF upper_level > sub_level (strict greater-than)
--      If upper_level <= sub_level → bonus = 0 (upper gets nothing)
--   3. Bonus is paid by the COMPANY (gift fee 50%), NOT deducted from
--      sub-agent's commission, NOT deducted from host's earnings.
-- =====================================================

-- 1) Helper: numeric level (1..5) for any agency, regardless of code style
CREATE OR REPLACE FUNCTION public.get_agency_numeric_level(_agency_id uuid)
RETURNS integer
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _code text;
  _order integer;
BEGIN
  SELECT level INTO _code FROM agencies WHERE id = _agency_id;
  IF _code IS NULL THEN RETURN 1; END IF;

  -- A1..A5 style
  IF _code ~ '^A[1-9]+$' THEN
    RETURN GREATEST(1, LEAST(5, substring(_code from 2)::int));
  END IF;

  -- bronze/silver/gold/platinum/diamond style
  SELECT display_order INTO _order
    FROM agency_level_tiers
   WHERE level_code = _code AND is_active = true
   LIMIT 1;

  RETURN COALESCE(_order, 1);
END;
$$;

-- 2) Helper: commission rate% for a numeric level (1..5)
CREATE OR REPLACE FUNCTION public.get_rate_for_numeric_level(_level integer)
RETURNS numeric
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _rate numeric;
BEGIN
  SELECT commission_rate INTO _rate
    FROM agency_level_tiers
   WHERE display_order = GREATEST(1, LEAST(5, COALESCE(_level, 1)))
     AND is_active = true
   LIMIT 1;
  -- Hard fallback to your dictated table
  IF _rate IS NULL THEN
    _rate := CASE _level
      WHEN 1 THEN 3
      WHEN 2 THEN 5
      WHEN 3 THEN 7
      WHEN 4 THEN 10
      WHEN 5 THEN 12
      ELSE 3
    END;
  END IF;
  RETURN _rate;
END;
$$;

-- 3) Allow upper_agency_referral_bonus as a transaction_type
DO $$
BEGIN
  -- Drop old check constraint if exists
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'agency_commission_history_transaction_type_check') THEN
    ALTER TABLE agency_commission_history DROP CONSTRAINT agency_commission_history_transaction_type_check;
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- 4) Make sure upper-bonus rows are idempotent per source transaction
-- (composite UNIQUE on source_transaction_id + transaction_type already exists per Pkg26)

-- 5) Rewrite credit_sub_agent_commission with NEW level-difference model
CREATE OR REPLACE FUNCTION public.credit_sub_agent_commission(
  _host_id uuid,
  _agency_id uuid,
  _host_earnings numeric,
  _source_id uuid,
  _source_type text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _parent_agency_id uuid;
  _sub_level int;
  _upper_level int;
  _sub_rate numeric;
  _upper_rate numeric;
  _bonus_rate numeric;
  _bonus_beans bigint;
  _is_sub_agency boolean;
BEGIN
  IF _host_earnings IS NULL OR _host_earnings <= 0 THEN
    RETURN;
  END IF;

  -- Determine if this agency is a sub-agency (has a parent)
  SELECT parent_agency_id INTO _parent_agency_id
    FROM agencies
   WHERE id = _agency_id;

  _is_sub_agency := _parent_agency_id IS NOT NULL;

  IF NOT _is_sub_agency THEN
    -- Top-level agency: no upper bonus, nothing to credit beyond own commission
    -- (own commission handled by auto_credit_agency_commission trigger)
    RETURN;
  END IF;

  -- Compute levels
  _sub_level   := get_agency_numeric_level(_agency_id);
  _upper_level := get_agency_numeric_level(_parent_agency_id);

  -- Strict rule: upper MUST be strictly higher than sub
  IF _upper_level <= _sub_level THEN
    RETURN;
  END IF;

  _sub_rate   := get_rate_for_numeric_level(_sub_level);
  _upper_rate := get_rate_for_numeric_level(_upper_level);
  _bonus_rate := _upper_rate - _sub_rate;

  IF _bonus_rate <= 0 THEN
    RETURN;
  END IF;

  -- Bonus paid by COMPANY (gift fee). Deduct from no one.
  _bonus_beans := FLOOR(_host_earnings * _bonus_rate / 100.0)::bigint;
  IF _bonus_beans <= 0 THEN
    RETURN;
  END IF;

  -- Log to commission history (idempotent via composite unique)
  INSERT INTO agency_commission_history (
    agency_id,
    host_id,
    source_transaction_id,
    transaction_type,
    commission_amount,
    commission_rate,
    notes,
    created_at
  ) VALUES (
    _parent_agency_id,
    _host_id,
    _source_id,
    'upper_agency_referral_bonus',
    _bonus_beans,
    _bonus_rate,
    format('Upper L%s bonus from sub L%s host (%s%% - %s%% = %s%%)',
           _upper_level, _sub_level, _upper_rate, _sub_rate, _bonus_rate),
    now()
  )
  ON CONFLICT (source_transaction_id, transaction_type) DO NOTHING;

  IF NOT FOUND THEN
    RETURN;  -- already credited
  END IF;

  -- Credit upper agency beans (paid by company, no deduction elsewhere)
  PERFORM set_config('app.bypass_profile_protection', 'true', true);
  UPDATE agencies
     SET beans_balance = COALESCE(beans_balance, 0) + _bonus_beans,
         updated_at = now()
   WHERE id = _parent_agency_id;
END;
$$;

-- 6) Update resolve_agency_commission_rate to use numeric-level lookup correctly
CREATE OR REPLACE FUNCTION public.resolve_agency_commission_rate(_agency_id uuid)
RETURNS numeric
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _level int;
BEGIN
  _level := get_agency_numeric_level(_agency_id);
  RETURN get_rate_for_numeric_level(_level);
END;
$$;

COMMENT ON FUNCTION public.credit_sub_agent_commission IS
'Pkg27: Upper-agency referral bonus. Bonus = upper_rate - sub_rate, only if upper_level > sub_level. Paid by company.';