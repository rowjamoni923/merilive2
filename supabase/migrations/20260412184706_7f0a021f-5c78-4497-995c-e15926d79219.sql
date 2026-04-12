
-- Fix NOT NULL constraints on legacy columns that block new edge function inserts
ALTER TABLE public.helper_orders ALTER COLUMN diamond_amount DROP NOT NULL;
ALTER TABLE public.helper_orders ALTER COLUMN customer_id DROP NOT NULL;
ALTER TABLE public.helper_orders ALTER COLUMN total_price_usd DROP NOT NULL;

-- Set defaults so legacy code still works
ALTER TABLE public.helper_orders ALTER COLUMN diamond_amount SET DEFAULT 0;
ALTER TABLE public.helper_orders ALTER COLUMN total_price_usd SET DEFAULT 0;

-- Create/replace sync trigger to keep legacy columns in sync with new columns
CREATE OR REPLACE FUNCTION public.sync_helper_orders_compat()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- Sync new → legacy
  IF NEW.coin_amount IS NOT NULL AND (NEW.diamond_amount IS NULL OR NEW.diamond_amount = 0) THEN
    NEW.diamond_amount := NEW.coin_amount;
  END IF;
  IF NEW.user_id IS NOT NULL AND NEW.customer_id IS NULL THEN
    NEW.customer_id := NEW.user_id;
  END IF;
  IF NEW.amount_usd IS NOT NULL AND (NEW.total_price_usd IS NULL OR NEW.total_price_usd = 0) THEN
    NEW.total_price_usd := NEW.amount_usd;
  END IF;

  -- Sync legacy → new (for old code paths)
  IF NEW.diamond_amount IS NOT NULL AND NEW.diamond_amount > 0 AND (NEW.coin_amount IS NULL OR NEW.coin_amount = 0) THEN
    NEW.coin_amount := NEW.diamond_amount;
  END IF;
  IF NEW.customer_id IS NOT NULL AND NEW.user_id IS NULL THEN
    NEW.user_id := NEW.customer_id;
  END IF;
  IF NEW.total_price_usd IS NOT NULL AND NEW.total_price_usd > 0 AND (NEW.amount_usd IS NULL OR NEW.amount_usd = 0) THEN
    NEW.amount_usd := NEW.total_price_usd;
  END IF;

  RETURN NEW;
END;
$$;

-- Drop old trigger if exists, recreate
DROP TRIGGER IF EXISTS trg_sync_helper_orders_compat ON public.helper_orders;
DROP TRIGGER IF EXISTS trg_sync_helper_orders_compat_columns ON public.helper_orders;

CREATE TRIGGER trg_sync_helper_orders_compat
  BEFORE INSERT OR UPDATE ON public.helper_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_helper_orders_compat();
