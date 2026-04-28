
-- Pkg26 final
ALTER TABLE public.profiles      ALTER COLUMN beans_balance TYPE bigint;
ALTER TABLE public.agencies      ALTER COLUMN beans_balance TYPE bigint;
ALTER TABLE public.agencies      ALTER COLUMN wallet_balance TYPE bigint;

ALTER TABLE public.gift_transactions ALTER COLUMN coin_amount TYPE bigint;
ALTER TABLE public.gift_transactions ALTER COLUMN coin_cost   TYPE bigint;
ALTER TABLE public.gift_transactions ALTER COLUMN coin_value  TYPE bigint;
ALTER TABLE public.gift_transactions ALTER COLUMN receiver_beans TYPE bigint;

ALTER TABLE public.gifts ALTER COLUMN coin_value     TYPE bigint;
ALTER TABLE public.gifts ALTER COLUMN receiver_beans TYPE bigint;

ALTER TABLE public.private_calls ALTER COLUMN coins_per_minute      TYPE bigint;
ALTER TABLE public.private_calls ALTER COLUMN coins_spent           TYPE bigint;
ALTER TABLE public.private_calls ALTER COLUMN host_earned           TYPE bigint;
ALTER TABLE public.private_calls ALTER COLUMN host_earnings_amount  TYPE bigint;
ALTER TABLE public.private_calls ALTER COLUMN total_coins_deducted  TYPE bigint;

ALTER TABLE public.coin_transfers          ALTER COLUMN amount TYPE bigint;
ALTER TABLE public.helper_orders           ALTER COLUMN coin_amount TYPE bigint;
ALTER TABLE public.helper_topup_requests   ALTER COLUMN amount TYPE bigint;
ALTER TABLE public.helper_transactions     ALTER COLUMN amount TYPE bigint;
ALTER TABLE public.helper_withdrawal_requests ALTER COLUMN amount TYPE bigint;
ALTER TABLE public.parcel_templates        ALTER COLUMN coin_cost TYPE bigint;
ALTER TABLE public.pk_battle_gifts         ALTER COLUMN coin_amount TYPE bigint;
ALTER TABLE public.call_events             ALTER COLUMN coin_cost TYPE bigint;
ALTER TABLE public.first_recharge_claims   ALTER COLUMN original_amount TYPE bigint;
ALTER TABLE public.agency_withdrawals      ALTER COLUMN net_diamonds_to_helper TYPE bigint;

-- Composite idempotency
DROP INDEX IF EXISTS public.idx_agency_commission_unique_source;
CREATE UNIQUE INDEX IF NOT EXISTS idx_agency_commission_unique_source_type
  ON public.agency_commission_history (source_transaction_id, transaction_type)
  WHERE source_transaction_id IS NOT NULL;

-- Sub-agent linkage
ALTER TABLE public.agency_hosts
  ADD COLUMN IF NOT EXISTS referral_code TEXT;
CREATE INDEX IF NOT EXISTS idx_agency_hosts_referral_code
  ON public.agency_hosts (referral_code) WHERE referral_code IS NOT NULL;

ALTER TABLE public.sub_agent_commissions
  ADD COLUMN IF NOT EXISTS source_type TEXT NOT NULL DEFAULT 'gift';
CREATE UNIQUE INDEX IF NOT EXISTS idx_sub_agent_commission_unique_source
  ON public.sub_agent_commissions (gift_transaction_id, source_type)
  WHERE gift_transaction_id IS NOT NULL;

-- Sub-agent credit function
CREATE OR REPLACE FUNCTION public.credit_sub_agent_commission(
  _host_id       UUID,
  _agency_id     UUID,
  _host_earnings NUMERIC,
  _source_id     UUID,
  _source_type   TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _referral_code  TEXT;
  _sub_agent      RECORD;
  _sub_commission NUMERIC;
BEGIN
  IF _host_earnings IS NULL OR _host_earnings <= 0 THEN
    RETURN;
  END IF;

  SELECT referral_code INTO _referral_code
    FROM agency_hosts
   WHERE host_id = _host_id AND agency_id = _agency_id AND status = 'active'
   LIMIT 1;

  IF _referral_code IS NULL OR _referral_code = '' THEN
    RETURN;
  END IF;

  SELECT id, user_id, commission_rate
    INTO _sub_agent
    FROM sub_agents
   WHERE agency_id     = _agency_id
     AND referral_code = _referral_code
     AND status        = 'active'
   LIMIT 1;

  IF _sub_agent.id IS NULL OR COALESCE(_sub_agent.commission_rate, 0) <= 0 THEN
    RETURN;
  END IF;

  _sub_commission := FLOOR(_host_earnings * _sub_agent.commission_rate / 100.0);
  IF _sub_commission <= 0 THEN
    RETURN;
  END IF;

  INSERT INTO sub_agent_commissions (
    sub_agent_id, host_id, gift_transaction_id, commission_amount, commission_rate, source_type
  ) VALUES (
    _sub_agent.id, _host_id, _source_id, _sub_commission, _sub_agent.commission_rate, _source_type
  )
  ON CONFLICT (gift_transaction_id, source_type) DO NOTHING;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  UPDATE sub_agents
     SET total_earnings = COALESCE(total_earnings, 0) + _sub_commission,
         updated_at     = now()
   WHERE id = _sub_agent.id;

  PERFORM set_config('app.bypass_profile_protection', 'true', true);

  UPDATE agencies
     SET beans_balance = GREATEST(COALESCE(beans_balance, 0) - _sub_commission, 0)
   WHERE id = _agency_id;

  UPDATE profiles
     SET beans_balance = COALESCE(beans_balance, 0) + _sub_commission
   WHERE id = _sub_agent.user_id;
END;
$$;

-- Patch parent triggers
CREATE OR REPLACE FUNCTION public.auto_credit_agency_commission()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _host_agency_id    UUID;
  _rate              NUMERIC;
  _commission_amount NUMERIC;
  _host_earnings     NUMERIC;
  _inserted_id       UUID;
BEGIN
  SELECT ah.agency_id INTO _host_agency_id
    FROM agency_hosts ah
   WHERE ah.host_id = NEW.receiver_id AND ah.status = 'active'
   LIMIT 1;
  IF _host_agency_id IS NULL THEN RETURN NEW; END IF;

  _host_earnings := COALESCE(NEW.receiver_beans, 0);
  IF _host_earnings <= 0 THEN RETURN NEW; END IF;

  _rate := public.resolve_agency_commission_rate(_host_agency_id);
  _commission_amount := FLOOR(_host_earnings * _rate / 100.0);
  IF _commission_amount <= 0 THEN RETURN NEW; END IF;

  PERFORM set_config('app.bypass_profile_protection', 'true', true);

  INSERT INTO agency_commission_history (
    agency_id, host_id, transaction_type, original_amount,
    commission_rate, commission_amount, source_transaction_id, notes
  ) VALUES (
    _host_agency_id, NEW.receiver_id, 'gift', _host_earnings,
    _rate, _commission_amount, NEW.id, 'Gift commission (tiered)'
  )
  ON CONFLICT (source_transaction_id, transaction_type) DO NOTHING
  RETURNING id INTO _inserted_id;

  IF _inserted_id IS NULL THEN
    RETURN NEW;
  END IF;

  UPDATE agencies
     SET beans_balance = COALESCE(beans_balance, 0) + _commission_amount
   WHERE id = _host_agency_id;

  PERFORM public.credit_sub_agent_commission(
    NEW.receiver_id, _host_agency_id, _host_earnings, NEW.id, 'gift'
  );

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.auto_credit_agency_commission_from_call()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _host_agency_id    UUID;
  _rate              NUMERIC;
  _commission_amount NUMERIC;
  _host_earnings     NUMERIC;
  _inserted_id       UUID;
BEGIN
  IF NEW.status NOT IN ('ended', 'completed', 'settled') OR OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  SELECT ah.agency_id INTO _host_agency_id
    FROM agency_hosts ah
   WHERE ah.host_id = NEW.host_id AND ah.status = 'active'
   LIMIT 1;
  IF _host_agency_id IS NULL THEN RETURN NEW; END IF;

  _host_earnings := COALESCE(NULLIF(NEW.host_earned, 0), NULLIF(NEW.host_earnings_amount, 0), 0);
  IF _host_earnings IS NULL OR _host_earnings <= 0 THEN RETURN NEW; END IF;

  _rate := public.resolve_agency_commission_rate(_host_agency_id);
  _commission_amount := FLOOR(_host_earnings * _rate / 100.0);
  IF _commission_amount <= 0 THEN RETURN NEW; END IF;

  PERFORM set_config('app.bypass_profile_protection', 'true', true);

  INSERT INTO agency_commission_history (
    agency_id, host_id, transaction_type, original_amount,
    commission_rate, commission_amount, source_transaction_id, notes
  ) VALUES (
    _host_agency_id, NEW.host_id, 'call', _host_earnings,
    _rate, _commission_amount, NEW.id,
    'Call commission (tiered, duration: ' || COALESCE(NEW.duration_seconds, 0) || 's)'
  )
  ON CONFLICT (source_transaction_id, transaction_type) DO NOTHING
  RETURNING id INTO _inserted_id;

  IF _inserted_id IS NULL THEN
    RETURN NEW;
  END IF;

  UPDATE agencies
     SET beans_balance = COALESCE(beans_balance, 0) + _commission_amount
   WHERE id = _host_agency_id;

  PERFORM public.credit_sub_agent_commission(
    NEW.host_id, _host_agency_id, _host_earnings, NEW.id, 'call'
  );

  RETURN NEW;
END;
$$;
