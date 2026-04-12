ALTER TABLE public.helper_orders
  ADD COLUMN IF NOT EXISTS user_id uuid,
  ADD COLUMN IF NOT EXISTS coin_amount integer,
  ADD COLUMN IF NOT EXISTS amount_usd numeric,
  ADD COLUMN IF NOT EXISTS currency_code text,
  ADD COLUMN IF NOT EXISTS user_country_code text,
  ADD COLUMN IF NOT EXISTS user_payment_proof text,
  ADD COLUMN IF NOT EXISTS payment_details jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS processed_at timestamp with time zone;

UPDATE public.helper_orders
SET
  user_id = COALESCE(user_id, customer_id),
  coin_amount = COALESCE(coin_amount, diamond_amount),
  amount_usd = COALESCE(amount_usd, total_price_usd),
  amount_local = COALESCE(amount_local, local_price),
  currency_code = COALESCE(currency_code, local_currency),
  user_payment_proof = COALESCE(user_payment_proof, payment_proof_url)
WHERE user_id IS NULL
   OR coin_amount IS NULL
   OR amount_usd IS NULL
   OR amount_local IS NULL
   OR currency_code IS NULL
   OR user_payment_proof IS NULL;

CREATE OR REPLACE FUNCTION public.sync_helper_orders_compat_columns()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.user_id := COALESCE(NEW.user_id, NEW.customer_id);
  NEW.customer_id := COALESCE(NEW.customer_id, NEW.user_id);

  NEW.coin_amount := COALESCE(NEW.coin_amount, NEW.diamond_amount);
  NEW.diamond_amount := COALESCE(NEW.diamond_amount, NEW.coin_amount);

  NEW.amount_usd := COALESCE(NEW.amount_usd, NEW.total_price_usd);
  NEW.total_price_usd := COALESCE(NEW.total_price_usd, NEW.amount_usd);

  NEW.amount_local := COALESCE(NEW.amount_local, NEW.local_price);
  NEW.local_price := COALESCE(NEW.local_price, NEW.amount_local);

  NEW.currency_code := COALESCE(NEW.currency_code, NEW.local_currency);
  NEW.local_currency := COALESCE(NEW.local_currency, NEW.currency_code);

  NEW.user_payment_proof := COALESCE(NEW.user_payment_proof, NEW.payment_proof_url);
  NEW.payment_proof_url := COALESCE(NEW.payment_proof_url, NEW.user_payment_proof);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_helper_orders_compat_columns ON public.helper_orders;
CREATE TRIGGER trg_sync_helper_orders_compat_columns
BEFORE INSERT OR UPDATE ON public.helper_orders
FOR EACH ROW
EXECUTE FUNCTION public.sync_helper_orders_compat_columns();

CREATE OR REPLACE FUNCTION public.helper_transfer_diamonds_to_agency(
  _sender_id uuid,
  _target_agency_id uuid,
  _amount bigint,
  _sender_type text DEFAULT 'trader_to_agency'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  helper_rec record;
  sender_agency_rec record;
  target_agency_rec record;
  sender_coins bigint := 0;
  helper_deducted bigint := 0;
  agency_deducted bigint := 0;
  user_deducted bigint := 0;
  remaining bigint := _amount;
  new_agency_balance bigint := 0;
BEGIN
  IF _amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Amount must be positive');
  END IF;

  SELECT *
  INTO target_agency_rec
  FROM public.agencies
  WHERE id = _target_agency_id
  FOR UPDATE;

  IF target_agency_rec IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Target agency not found');
  END IF;

  IF _sender_type = 'agency_to_agency' THEN
    SELECT *
    INTO sender_agency_rec
    FROM public.agencies
    WHERE owner_id = _sender_id
    FOR UPDATE;

    IF sender_agency_rec IS NOT NULL AND COALESCE(sender_agency_rec.diamond_balance, 0) >= remaining THEN
      UPDATE public.agencies
      SET diamond_balance = COALESCE(diamond_balance, 0) - remaining,
          updated_at = now()
      WHERE id = sender_agency_rec.id;

      agency_deducted := remaining;
      remaining := 0;
    ELSIF sender_agency_rec IS NOT NULL AND COALESCE(sender_agency_rec.diamond_balance, 0) > 0 THEN
      agency_deducted := COALESCE(sender_agency_rec.diamond_balance, 0);
      remaining := remaining - agency_deducted;

      UPDATE public.agencies
      SET diamond_balance = 0,
          updated_at = now()
      WHERE id = sender_agency_rec.id;
    END IF;
  END IF;

  IF remaining > 0 THEN
    SELECT *
    INTO helper_rec
    FROM public.topup_helpers
    WHERE user_id = _sender_id
    FOR UPDATE;

    IF helper_rec IS NOT NULL AND COALESCE(helper_rec.wallet_balance, 0) >= remaining THEN
      UPDATE public.topup_helpers
      SET wallet_balance = COALESCE(wallet_balance, 0) - remaining,
          updated_at = now()
      WHERE id = helper_rec.id;

      helper_deducted := remaining;
      remaining := 0;
    ELSIF helper_rec IS NOT NULL AND COALESCE(helper_rec.wallet_balance, 0) > 0 THEN
      helper_deducted := COALESCE(helper_rec.wallet_balance, 0);
      remaining := remaining - helper_deducted;

      UPDATE public.topup_helpers
      SET wallet_balance = 0,
          updated_at = now()
      WHERE id = helper_rec.id;
    END IF;
  END IF;

  IF remaining > 0 THEN
    SELECT COALESCE(coins, 0)
    INTO sender_coins
    FROM public.profiles
    WHERE id = _sender_id
    FOR UPDATE;

    IF sender_coins >= remaining THEN
      PERFORM set_config('app.bypass_profile_protection', 'true', true);

      UPDATE public.profiles
      SET coins = COALESCE(coins, 0) - remaining
      WHERE id = _sender_id;

      user_deducted := remaining;
      remaining := 0;
    END IF;
  END IF;

  IF remaining > 0 THEN
    IF agency_deducted > 0 AND sender_agency_rec IS NOT NULL THEN
      UPDATE public.agencies
      SET diamond_balance = COALESCE(diamond_balance, 0) + agency_deducted,
          updated_at = now()
      WHERE id = sender_agency_rec.id;
    END IF;

    IF helper_deducted > 0 AND helper_rec IS NOT NULL THEN
      UPDATE public.topup_helpers
      SET wallet_balance = COALESCE(wallet_balance, 0) + helper_deducted,
          updated_at = now()
      WHERE id = helper_rec.id;
    END IF;

    RETURN jsonb_build_object('success', false, 'error', 'Insufficient balance');
  END IF;

  UPDATE public.agencies
  SET diamond_balance = COALESCE(diamond_balance, 0) + _amount,
      updated_at = now()
  WHERE id = _target_agency_id
  RETURNING diamond_balance INTO new_agency_balance;

  INSERT INTO public.coin_transfers (sender_id, receiver_id, amount, transfer_type, status)
  VALUES (_sender_id, COALESCE(target_agency_rec.owner_id, _sender_id), _amount, _sender_type, 'completed');

  RETURN jsonb_build_object(
    'success', true,
    'amount', _amount,
    'agency_deducted', agency_deducted,
    'helper_deducted', helper_deducted,
    'user_deducted', user_deducted,
    'new_agency_balance', new_agency_balance
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.helper_transfer_diamonds_to_agency(uuid, uuid, bigint, text) TO authenticated;