
CREATE OR REPLACE FUNCTION public.get_official_coin_usd_rate()
RETURNS NUMERIC
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  -- Official price of one diamond in USD = total base USD price / total base diamonds
  -- (bonus_coins intentionally excluded — bonuses are promotional, not official price)
  SELECT COALESCE(
    (SELECT SUM(price_usd)::numeric / NULLIF(SUM(coins_amount), 0)
       FROM public.coin_packages
       WHERE is_active = true AND price_usd > 0 AND coins_amount > 0),
    (SELECT (meta->>'coin_to_usd_rate')::numeric
       FROM public.profit_config
       WHERE sector_key = '_global'),
    0.0001
  );
$$;
