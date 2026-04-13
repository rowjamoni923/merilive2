
CREATE OR REPLACE FUNCTION public.get_transfer_wallet_sources(_user_id uuid)
RETURNS TABLE(
  helper_id uuid,
  helper_wallet_balance bigint,
  agency_id uuid,
  agency_diamond_balance bigint,
  personal_coins bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  profile_agency_id uuid;
BEGIN
  SELECT p.agency_id
  INTO profile_agency_id
  FROM public.profiles p
  WHERE p.id = _user_id;

  RETURN QUERY
  WITH latest_helper AS (
    SELECT h.id,
           COALESCE(h.wallet_balance, 0)::bigint AS wallet_balance
    FROM public.topup_helpers h
    WHERE h.user_id = _user_id
      AND COALESCE(h.is_verified, false) = true
      AND COALESCE(h.is_active, true) = true
    ORDER BY h.updated_at DESC NULLS LAST, h.created_at DESC NULLS LAST, h.id DESC
    LIMIT 1
  ),
  latest_owned_agency AS (
    SELECT a.id,
           COALESCE(a.diamond_balance, 0)::bigint AS diamond_balance
    FROM public.agencies a
    WHERE a.owner_id = _user_id
      AND COALESCE(a.is_active, true) = true
    ORDER BY a.updated_at DESC NULLS LAST, a.created_at DESC NULLS LAST, a.id DESC
    LIMIT 1
  ),
  latest_profile_agency AS (
    SELECT a.id,
           COALESCE(a.diamond_balance, 0)::bigint AS diamond_balance
    FROM public.agencies a
    WHERE a.id = profile_agency_id
      AND COALESCE(a.is_active, true) = true
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
    COALESCE((SELECT p.coins FROM public.profiles p WHERE p.id = _user_id), 0)::bigint
  FROM (SELECT 1) base
  LEFT JOIN latest_helper lh ON true
  LEFT JOIN resolved_agency ra ON true;
END;
$$;
