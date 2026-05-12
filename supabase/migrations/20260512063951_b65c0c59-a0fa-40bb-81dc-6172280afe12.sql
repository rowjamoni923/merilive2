-- Remove legacy integer overloads of trader-wallet transfer RPCs.
-- Pkg26 introduced bigint versions but the integer ones were never dropped,
-- causing PostgREST "Could not choose the best candidate function" on every
-- Trader Wallet → User / Agency / Self top-up.

DROP FUNCTION IF EXISTS public.helper_transfer_coins_to_user(integer, uuid, uuid, text);
DROP FUNCTION IF EXISTS public.helper_transfer_coins_to_user(_amount integer, _receiver_id uuid, _sender_id uuid, _sender_type text);

DROP FUNCTION IF EXISTS public.helper_transfer_diamonds_to_agency(integer, uuid, text, uuid);
DROP FUNCTION IF EXISTS public.helper_transfer_diamonds_to_agency(_amount integer, _sender_id uuid, _sender_type text, _target_agency_id uuid);

-- Sanity: confirm one bigint version remains for each.
DO $$
DECLARE c int;
BEGIN
  SELECT count(*) INTO c FROM pg_proc WHERE proname = 'helper_transfer_coins_to_user';
  IF c <> 1 THEN RAISE EXCEPTION 'helper_transfer_coins_to_user overload count = %', c; END IF;
  SELECT count(*) INTO c FROM pg_proc WHERE proname = 'helper_transfer_diamonds_to_agency';
  IF c <> 1 THEN RAISE EXCEPTION 'helper_transfer_diamonds_to_agency overload count = %', c; END IF;
END $$;