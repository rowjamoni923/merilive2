CREATE OR REPLACE FUNCTION public.get_google_play_product_info(_product_id text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'productId', cp.product_id,
    'coins', (cp.coins_amount + COALESCE(cp.bonus_coins, 0)),
    'baseCoins', cp.coins_amount,
    'bonusCoins', COALESCE(cp.bonus_coins, 0),
    'priceUsd', cp.price_usd
  )
  FROM public.coin_packages cp
  WHERE cp.is_active = true
    AND cp.product_id = _product_id
    AND cp.product_id IS NOT NULL
    AND cp.product_id <> ''
  LIMIT 1;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_recharge_transactions_google_order_unique
ON public.recharge_transactions (google_order_id)
WHERE google_order_id IS NOT NULL AND google_order_id <> '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_recharge_transactions_google_token_unique
ON public.recharge_transactions (transaction_id)
WHERE payment_method = 'google_play'
  AND transaction_id IS NOT NULL
  AND transaction_id <> '';