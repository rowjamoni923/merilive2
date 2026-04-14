
-- Fix user_purchases: add is_equipped column
ALTER TABLE public.user_purchases ADD COLUMN IF NOT EXISTS is_equipped boolean DEFAULT false;

-- Fix user_purchased_backgrounds: ensure price_paid exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='user_purchased_backgrounds') THEN
    ALTER TABLE public.user_purchased_backgrounds ADD COLUMN IF NOT EXISTS price_paid integer DEFAULT 0;
  END IF;
END $$;
