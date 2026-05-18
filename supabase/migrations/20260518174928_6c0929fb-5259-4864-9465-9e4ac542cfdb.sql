
-- 1. Add columns the app already sends but the table was missing
ALTER TABLE public.helper_topup_requests
  ADD COLUMN IF NOT EXISTS user_id uuid,
  ADD COLUMN IF NOT EXISTS amount_usd numeric(12,2),
  ADD COLUMN IF NOT EXISTS coin_amount bigint,
  ADD COLUMN IF NOT EXISTS transaction_id text,
  ADD COLUMN IF NOT EXISTS notes text;

-- Backfill user_id from topup_helpers for any pre-existing rows
UPDATE public.helper_topup_requests r
   SET user_id = h.user_id
  FROM public.topup_helpers h
 WHERE r.helper_id = h.id AND r.user_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_helper_topup_requests_user_id   ON public.helper_topup_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_helper_topup_requests_status    ON public.helper_topup_requests(status);

-- 2. Trader-wallet approval RPC: computes diamonds from admin-set USD-per-100k rate
CREATE OR REPLACE FUNCTION public.admin_approve_helper_topup(
  _request_id   uuid,
  _amount_usd   numeric DEFAULT NULL,
  _admin_notes  text    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _req      RECORD;
  _rate_cfg jsonb;
  _usd_per_100k numeric;
  _amount   numeric;
  _diamonds bigint;
  _admin_id uuid;
BEGIN
  IF NOT public.is_active_admin_session() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  -- Load admin-set rate (no hardcoded fallback)
  SELECT CASE WHEN jsonb_typeof(setting_value::jsonb) = 'object'
              THEN setting_value::jsonb ELSE NULL END
    INTO _rate_cfg
    FROM public.app_settings
   WHERE setting_key = 'trader_wallet_topup_rate';

  _usd_per_100k := NULLIF((_rate_cfg->>'usd_per_100k_diamonds'),'')::numeric;
  IF _usd_per_100k IS NULL OR _usd_per_100k <= 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'trader_wallet_topup_rate not configured. Set "usd_per_100k_diamonds" in Pricing Hub → Helper.'
    );
  END IF;

  SELECT * INTO _req
    FROM public.helper_topup_requests
   WHERE id = _request_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Request not found');
  END IF;
  IF _req.status IS DISTINCT FROM 'pending' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Already processed');
  END IF;

  _amount := COALESCE(_amount_usd, _req.amount_usd);
  IF _amount IS NULL OR _amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid USD amount');
  END IF;

  -- Diamonds = floor(usd * 100,000 / usd_per_100k_diamonds)
  _diamonds := floor(_amount * 100000.0 / _usd_per_100k)::bigint;
  IF _diamonds <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Computed diamonds <= 0; check rate or USD amount');
  END IF;

  -- Resolve admin id for audit (may be null if no profile mirror)
  _admin_id := COALESCE(_req.processed_by, auth.uid());

  -- Credit Trader Wallet
  PERFORM set_config('app.bypass_profile_protection', 'true', true);
  UPDATE public.topup_helpers
     SET wallet_balance = COALESCE(wallet_balance, 0) + _diamonds,
         total_bought   = COALESCE(total_bought,   0) + _diamonds,
         updated_at     = now()
   WHERE id = _req.helper_id;
  PERFORM set_config('app.bypass_profile_protection', 'false', true);

  -- Mark request approved with the computed amounts so history is exact
  UPDATE public.helper_topup_requests
     SET status       = 'approved',
         amount_usd   = _amount,
         coin_amount  = _diamonds,
         admin_notes  = COALESCE(_admin_notes, admin_notes),
         processed_at = now(),
         processed_by = _admin_id
   WHERE id = _request_id;

  -- Notify helper (uses notifications → trigger → FCM push)
  INSERT INTO public.notifications (user_id, type, title, message, data)
  SELECT h.user_id,
         'topup_approved',
         '💎 Trader Wallet Topped Up!',
         'Your manual top-up of $' || _amount || ' has been approved. '
           || _diamonds::text || ' diamonds added to your Trader Wallet.',
         jsonb_build_object('diamonds', _diamonds, 'amount_usd', _amount,
                            'rate_usd_per_100k', _usd_per_100k,
                            'request_id', _request_id)
    FROM public.topup_helpers h
   WHERE h.id = _req.helper_id;

  RETURN jsonb_build_object(
    'success', true,
    'request_id', _request_id,
    'diamonds', _diamonds,
    'amount_usd', _amount,
    'rate_usd_per_100k', _usd_per_100k
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_approve_helper_topup(uuid, numeric, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_approve_helper_topup(uuid, numeric, text) TO authenticated, service_role;

-- 3. Tiny helper to read the rate from the client without exposing the full table
CREATE OR REPLACE FUNCTION public.get_trader_wallet_topup_rate()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT CASE WHEN jsonb_typeof(setting_value::jsonb) = 'object'
              THEN setting_value::jsonb ELSE NULL END
    FROM public.app_settings
   WHERE setting_key = 'trader_wallet_topup_rate'
   LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION public.get_trader_wallet_topup_rate() TO authenticated, anon, service_role;
