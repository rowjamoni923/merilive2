
-- 1. Neutralize the duplicate weekly_earnings trigger (keep trigger for compatibility, make function a no-op)
CREATE OR REPLACE FUNCTION public.add_to_weekly_earnings()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- DEPRECATED (Pkg25): weekly_earnings is now updated exclusively inside
  -- process_gift_transaction RPC (gifts) and settle_private_call (calls).
  -- Keeping this trigger alive but no-op to avoid breaking any legacy flow
  -- that depended on the trigger's existence.
  RETURN NEW;
END;
$$;

-- 2. Idempotent agency commission: prevent double-credit if trigger ever re-fires
-- 2a. Backfill cleanup: remove duplicate agency commission rows (keep oldest)
WITH dupes AS (
  SELECT id,
         ROW_NUMBER() OVER (PARTITION BY source_transaction_id ORDER BY created_at) AS rn
    FROM agency_commission_history
   WHERE source_transaction_id IS NOT NULL
)
DELETE FROM agency_commission_history
 WHERE id IN (SELECT id FROM dupes WHERE rn > 1);

-- 2b. Unique constraint to enforce idempotency at DB level
CREATE UNIQUE INDEX IF NOT EXISTS idx_agency_commission_unique_source
  ON public.agency_commission_history (source_transaction_id)
  WHERE source_transaction_id IS NOT NULL;

-- 2c. Rewrite trigger to be safely idempotent
CREATE OR REPLACE FUNCTION public.auto_credit_agency_commission()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _host_agency_id UUID;
  _rate NUMERIC;
  _commission_amount NUMERIC;
  _host_earnings NUMERIC;
  _host_percent NUMERIC;
  _inserted_id UUID;
BEGIN
  SELECT ah.agency_id INTO _host_agency_id
    FROM agency_hosts ah
   WHERE ah.host_id = NEW.receiver_id AND ah.status = 'active' LIMIT 1;
  IF _host_agency_id IS NULL THEN RETURN NEW; END IF;

  _host_percent := public.get_effective_host_percent();
  _host_earnings := COALESCE(NEW.receiver_beans, FLOOR(NEW.coin_amount * COALESCE(_host_percent,0) / 100));
  IF _host_earnings <= 0 THEN RETURN NEW; END IF;

  _rate := public.resolve_agency_commission_rate(_host_agency_id);
  _commission_amount := FLOOR(_host_earnings * _rate / 100);
  IF _commission_amount <= 0 THEN RETURN NEW; END IF;

  -- Idempotent insert — same gift can never credit agency twice
  INSERT INTO agency_commission_history (
    agency_id, host_id, transaction_type, original_amount,
    commission_rate, commission_amount, source_transaction_id, notes
  )
  VALUES (
    _host_agency_id, NEW.receiver_id, 'gift', _host_earnings,
    _rate, _commission_amount, NEW.id, 'Gift commission (tiered)'
  )
  ON CONFLICT (source_transaction_id) DO NOTHING
  RETURNING id INTO _inserted_id;

  -- Only credit agency beans if the row was newly inserted (not already present)
  IF _inserted_id IS NOT NULL THEN
    PERFORM set_config('app.bypass_profile_protection', 'true', true);
    UPDATE agencies
       SET beans_balance = COALESCE(beans_balance, 0) + _commission_amount
     WHERE id = _host_agency_id;
  END IF;

  RETURN NEW;
END;
$$;
