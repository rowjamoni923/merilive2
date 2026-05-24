-- Pass-4 Recharge audit: prevent transaction-ID reuse exploits across helper_orders.
-- A user could submit the same valid bKash/Nagad TXN ID to multiple helpers (or
-- repeatedly to the same helper) and each "instant" path would auto-credit them,
-- draining helper wallets and double-paying the user. We add a dedicated indexed
-- column + partial unique index keyed on (payment_method, lower(provider_transaction_id))
-- so the database itself blocks duplicates regardless of which helper sees it.

ALTER TABLE public.helper_orders
  ADD COLUMN IF NOT EXISTS provider_transaction_id TEXT;

-- Backfill provider_transaction_id from existing payment_details JSON so the
-- unique index covers historical rows (only where it actually looks like a TXN ID).
UPDATE public.helper_orders
SET provider_transaction_id = NULLIF(TRIM(payment_details->>'transaction_id'), '')
WHERE provider_transaction_id IS NULL
  AND payment_details ? 'transaction_id';

-- Partial unique index: same TXN-ID can never be submitted twice for the same
-- payment method (bKash, Nagad, etc.). Case-insensitive to defeat trivial bypass.
CREATE UNIQUE INDEX IF NOT EXISTS helper_orders_provider_txn_unique
  ON public.helper_orders (LOWER(payment_method), LOWER(provider_transaction_id))
  WHERE provider_transaction_id IS NOT NULL
    AND status IN ('pending', 'completed', 'verified', 'processing');

-- Helpful lookup index for admin reconciliation by TXN ID
CREATE INDEX IF NOT EXISTS helper_orders_provider_txn_lookup
  ON public.helper_orders (LOWER(provider_transaction_id))
  WHERE provider_transaction_id IS NOT NULL;