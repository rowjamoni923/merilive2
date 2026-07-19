-- FINAL COIN PURGE: rename residual constraints + RPC params/columns

ALTER TABLE public.diamond_transactions RENAME CONSTRAINT coin_transactions_user_id_fkey TO diamond_transactions_user_id_fkey;
ALTER TABLE public.diamond_trader_transfers RENAME CONSTRAINT coin_trader_transfers_counterparty_agency_id_fkey TO diamond_trader_transfers_counterparty_agency_id_fkey;
ALTER TABLE public.diamond_trader_transfers RENAME CONSTRAINT coin_trader_transfers_counterparty_user_id_fkey TO diamond_trader_transfers_counterparty_user_id_fkey;
ALTER TABLE public.diamond_trader_transfers RENAME CONSTRAINT coin_trader_transfers_user_id_fkey TO diamond_trader_transfers_user_id_fkey;
ALTER TABLE public.zero_diamond_wave_log RENAME CONSTRAINT zero_coin_wave_log_pkey TO zero_diamond_wave_log_pkey;

-- Rename return column personal_coins -> personal_diamonds (requires DROP + CREATE)
DROP FUNCTION IF EXISTS public.get_transfer_wallet_sources(uuid);
CREATE OR REPLACE FUNCTION public.get_transfer_wallet_sources(_user_id uuid)
 RETURNS TABLE(helper_id uuid, helper_wallet_balance bigint, agency_id uuid, agency_diamond_balance bigint, personal_diamonds bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_is_service boolean := current_setting('request.jwt.claim.role', true) = 'service_role';
  profile_agency_id uuid;
BEGIN
  IF NOT (v_is_service
          OR (v_caller IS NOT NULL AND v_caller = _user_id)
          OR (v_caller IS NOT NULL AND public.is_admin(v_caller))) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT p.agency_id INTO profile_agency_id FROM public.profiles p WHERE p.id = _user_id;

  RETURN QUERY
  WITH latest_helper AS (
    SELECT h.id, COALESCE(h.wallet_balance, 0)::bigint AS wallet_balance
    FROM public.topup_helpers h
    WHERE h.user_id = _user_id
      AND COALESCE(h.is_verified, false) = true
      AND COALESCE(h.is_active, true) = true
    ORDER BY h.updated_at DESC NULLS LAST, h.created_at DESC NULLS LAST, h.id DESC
    LIMIT 1
  ),
  latest_owned_agency AS (
    SELECT a.id, COALESCE(a.diamond_balance, 0)::bigint AS diamond_balance
    FROM public.agencies a
    WHERE a.owner_id = _user_id AND COALESCE(a.is_active, true) = true
    ORDER BY a.updated_at DESC NULLS LAST, a.created_at DESC NULLS LAST, a.id DESC
    LIMIT 1
  ),
  latest_profile_agency AS (
    SELECT a.id, COALESCE(a.diamond_balance, 0)::bigint AS diamond_balance
    FROM public.agencies a
    WHERE a.id = profile_agency_id AND COALESCE(a.is_active, true) = true
    ORDER BY a.updated_at DESC NULLS LAST, a.created_at DESC NULLS LAST, a.id DESC
    LIMIT 1
  ),
  resolved_agency AS (
    SELECT * FROM latest_owned_agency
    UNION ALL
    SELECT * FROM latest_profile_agency
    WHERE NOT EXISTS (SELECT 1 FROM latest_owned_agency)
  )
  SELECT
    lh.id,
    COALESCE(lh.wallet_balance, 0),
    ra.id,
    COALESCE(ra.diamond_balance, 0),
    COALESCE((SELECT p.diamonds FROM public.profiles p WHERE p.id = _user_id), 0)::bigint
  FROM (SELECT 1) base
  LEFT JOIN latest_helper lh ON true
  LEFT JOIN resolved_agency ra ON true;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_transfer_wallet_sources(uuid) TO authenticated, service_role;

-- Rename param _coins -> _diamonds
DROP FUNCTION IF EXISTS public.record_gift_signal(uuid, uuid, text, text, bigint);
CREATE OR REPLACE FUNCTION public.record_gift_signal(_sender_id uuid, _receiver_id uuid, _device_id text, _ip_hash text, _diamonds bigint)
 RETURNS TABLE(suspect boolean, reason text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _shared_device boolean := false;
BEGIN
  IF _sender_id = _receiver_id THEN
    RETURN QUERY SELECT true, 'same_user'::text;
    RETURN;
  END IF;

  IF _device_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.profiles s, public.profiles r
      WHERE s.id = _sender_id AND r.id = _receiver_id
        AND s.device_fingerprints ? _device_id
        AND r.device_fingerprints ? _device_id
    ) INTO _shared_device;
  END IF;

  INSERT INTO public.gift_self_link_signals
    (sender_id, receiver_id, device_id, ip_hash, gift_count, diamond_total, suspect, suspect_reason)
  VALUES
    (_sender_id, _receiver_id, COALESCE(_device_id, ''), _ip_hash, 1, COALESCE(_diamonds,0),
     _shared_device, CASE WHEN _shared_device THEN 'shared_device' ELSE NULL END)
  ON CONFLICT (sender_id, receiver_id, device_id) DO UPDATE
    SET gift_count = public.gift_self_link_signals.gift_count + 1,
        diamond_total = public.gift_self_link_signals.diamond_total + COALESCE(_diamonds,0),
        last_at = now(),
        suspect = public.gift_self_link_signals.suspect OR _shared_device,
        suspect_reason = COALESCE(public.gift_self_link_signals.suspect_reason,
          CASE WHEN _shared_device THEN 'shared_device' END);

  RETURN QUERY SELECT _shared_device, CASE WHEN _shared_device THEN 'shared_device' ELSE NULL END;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.record_gift_signal(uuid, uuid, text, text, bigint) TO authenticated, service_role;