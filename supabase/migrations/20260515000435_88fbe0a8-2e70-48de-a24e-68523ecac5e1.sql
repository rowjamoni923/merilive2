-- Diagnostics for "Recommend tab shows no helper payment numbers"
-- 1) Log table — clients (or admins) write a row whenever the Recommend tab
--    resolves to ZERO usable methods so we can audit retroactively.
CREATE TABLE IF NOT EXISTS public.helper_payment_visibility_log (
  id BIGSERIAL PRIMARY KEY,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_id UUID,
  country_code TEXT,
  stage TEXT NOT NULL,                  -- e.g. 'empty_country', 'empty_after_helper_join', 'empty_global', 'success'
  legacy_count INTEGER NOT NULL DEFAULT 0,
  country_count INTEGER NOT NULL DEFAULT 0,
  global_count INTEGER NOT NULL DEFAULT 0,
  active_helper_count INTEGER NOT NULL DEFAULT 0,
  final_count INTEGER NOT NULL DEFAULT 0,
  notes JSONB
);

CREATE INDEX IF NOT EXISTS idx_hpvl_country_time
  ON public.helper_payment_visibility_log (country_code, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_hpvl_stage_time
  ON public.helper_payment_visibility_log (stage, occurred_at DESC);

ALTER TABLE public.helper_payment_visibility_log ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can write their own diagnostic row (helps trace per-user issues).
DROP POLICY IF EXISTS "auth users can insert visibility log" ON public.helper_payment_visibility_log;
CREATE POLICY "auth users can insert visibility log"
  ON public.helper_payment_visibility_log
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id IS NULL OR user_id = auth.uid());

-- Only admins can read.
DROP POLICY IF EXISTS "admins read visibility log" ON public.helper_payment_visibility_log;
CREATE POLICY "admins read visibility log"
  ON public.helper_payment_visibility_log
  FOR SELECT
  TO authenticated
  USING (public.is_admin(auth.uid()));

-- Admin session full access (consistent with project-wide admin policy)
DROP POLICY IF EXISTS "Admin session full access" ON public.helper_payment_visibility_log;
CREATE POLICY "Admin session full access"
  ON public.helper_payment_visibility_log
  FOR ALL
  USING (public.is_active_admin_session())
  WITH CHECK (public.is_active_admin_session());

-- 2) Diagnostic RPC — returns row-counts at every filter stage of the
--    Recommend-tab pipeline. Call from /admin to instantly see WHERE rows drop:
--    raw -> active -> country-matched -> helper-join -> wallet ok.
--    SECURITY DEFINER so admins can introspect even with strict RLS.
CREATE OR REPLACE FUNCTION public.diagnose_helper_payment_visibility(_country_code TEXT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin BOOLEAN;
  v_legacy_total INT;
  v_legacy_active INT;
  v_legacy_country INT;
  v_country_total INT;
  v_country_active INT;
  v_country_match INT;
  v_global_total INT;
  v_helpers_total INT;
  v_helpers_active INT;
  v_helpers_in_country INT;
  v_helpers_with_wallet INT;
  v_legacy_after_join INT;
  v_country_after_join INT;
  v_final_methods INT;
  v_min_wallet NUMERIC;
BEGIN
  v_is_admin := public.is_admin(auth.uid()) OR public.is_active_admin_session();
  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'admin only';
  END IF;

  -- Min wallet threshold from app_settings (mirror of helper-recharge-visibility-logic)
  SELECT COALESCE(((value::jsonb)->>'min_wallet_balance')::numeric, 300000)
    INTO v_min_wallet
    FROM public.app_settings
   WHERE key = 'helper_recharge_visibility'
   LIMIT 1;
  v_min_wallet := COALESCE(v_min_wallet, 300000);

  -- helper_payment_methods (legacy)
  SELECT count(*) INTO v_legacy_total       FROM public.helper_payment_methods;
  SELECT count(*) INTO v_legacy_active      FROM public.helper_payment_methods WHERE is_active = true;
  SELECT count(*) INTO v_legacy_country     FROM public.helper_payment_methods WHERE is_active = true AND country_code = _country_code;

  -- helper_country_payment_methods
  SELECT count(*) INTO v_country_total      FROM public.helper_country_payment_methods;
  SELECT count(*) INTO v_country_active     FROM public.helper_country_payment_methods WHERE is_active = true;
  SELECT count(*) INTO v_country_match      FROM public.helper_country_payment_methods WHERE is_active = true AND country_code = _country_code;

  -- Global crypto-style methods (no country filter)
  SELECT count(*) INTO v_global_total       FROM public.helper_country_payment_methods
   WHERE is_active = true
     AND lower(method_name) IN ('crypto','usdt','trc20','erc20','btc','eth','cryptocurrency');

  -- topup_helpers
  SELECT count(*) INTO v_helpers_total      FROM public.topup_helpers;
  SELECT count(*) INTO v_helpers_active     FROM public.topup_helpers WHERE is_active = true;
  SELECT count(*) INTO v_helpers_in_country FROM public.topup_helpers WHERE is_active = true AND country_code = _country_code;
  SELECT count(*) INTO v_helpers_with_wallet FROM public.topup_helpers
    WHERE is_active = true AND country_code = _country_code AND wallet_balance >= v_min_wallet;

  -- Joined surviving rows (what the Recommend tab actually shows)
  SELECT count(*) INTO v_legacy_after_join
    FROM public.helper_payment_methods hpm
    JOIN public.topup_helpers th ON th.id = hpm.helper_id
   WHERE hpm.is_active = true
     AND hpm.country_code = _country_code
     AND th.is_active = true
     AND th.country_code = _country_code
     AND th.wallet_balance >= v_min_wallet;

  SELECT count(*) INTO v_country_after_join
    FROM public.helper_country_payment_methods hcpm
    JOIN public.topup_helpers th ON th.id = hcpm.helper_id
   WHERE hcpm.is_active = true
     AND hcpm.country_code = _country_code
     AND th.is_active = true
     AND th.country_code = _country_code
     AND th.wallet_balance >= v_min_wallet;

  v_final_methods := v_legacy_after_join + v_country_after_join + v_global_total;

  RETURN jsonb_build_object(
    'country_code', _country_code,
    'min_wallet_threshold', v_min_wallet,
    'final_visible_methods', v_final_methods,
    'verdict', CASE
      WHEN v_final_methods > 0 THEN 'OK'
      WHEN v_helpers_in_country = 0 THEN 'NO_HELPER_IN_COUNTRY'
      WHEN v_helpers_with_wallet = 0 THEN 'NO_HELPER_MEETS_WALLET_THRESHOLD'
      WHEN v_legacy_country = 0 AND v_country_match = 0 THEN 'NO_PAYMENT_METHOD_ROWS_FOR_COUNTRY'
      WHEN v_legacy_after_join = 0 AND v_country_after_join = 0 THEN 'METHODS_EXIST_BUT_NO_ELIGIBLE_HELPER_JOIN'
      ELSE 'UNKNOWN_DROP'
    END,
    'helper_payment_methods', jsonb_build_object(
      'total', v_legacy_total,
      'active', v_legacy_active,
      'active_in_country', v_legacy_country,
      'after_helper_join', v_legacy_after_join
    ),
    'helper_country_payment_methods', jsonb_build_object(
      'total', v_country_total,
      'active', v_country_active,
      'active_in_country', v_country_match,
      'after_helper_join', v_country_after_join,
      'global_crypto', v_global_total
    ),
    'topup_helpers', jsonb_build_object(
      'total', v_helpers_total,
      'active', v_helpers_active,
      'active_in_country', v_helpers_in_country,
      'meets_wallet_threshold', v_helpers_with_wallet
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.diagnose_helper_payment_visibility(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.diagnose_helper_payment_visibility(TEXT) TO authenticated;

-- 3) Throttled client-side logger so an empty Recommend tab leaves a breadcrumb.
--    Keeps insert volume low: drops if the same (user_id, country_code, stage)
--    was logged in the last 10 minutes.
CREATE OR REPLACE FUNCTION public.log_helper_payment_visibility(
  _country_code TEXT,
  _stage TEXT,
  _legacy_count INT DEFAULT 0,
  _country_count INT DEFAULT 0,
  _global_count INT DEFAULT 0,
  _active_helper_count INT DEFAULT 0,
  _final_count INT DEFAULT 0,
  _notes JSONB DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_recent BOOLEAN;
BEGIN
  IF v_uid IS NULL THEN
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.helper_payment_visibility_log
     WHERE user_id = v_uid
       AND country_code = _country_code
       AND stage = _stage
       AND occurred_at > now() - interval '10 minutes'
  ) INTO v_recent;

  IF v_recent THEN
    RETURN;
  END IF;

  INSERT INTO public.helper_payment_visibility_log
    (user_id, country_code, stage, legacy_count, country_count, global_count,
     active_helper_count, final_count, notes)
  VALUES
    (v_uid, _country_code, _stage, _legacy_count, _country_count, _global_count,
     _active_helper_count, _final_count, _notes);
END;
$$;

REVOKE ALL ON FUNCTION public.log_helper_payment_visibility(TEXT,TEXT,INT,INT,INT,INT,INT,JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_helper_payment_visibility(TEXT,TEXT,INT,INT,INT,INT,INT,JSONB) TO authenticated;