DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.shop_items'::regclass
      AND contype = 'p'
  ) THEN
    ALTER TABLE public.shop_items
      ADD CONSTRAINT shop_items_pkey PRIMARY KEY (id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.user_purchases'::regclass
      AND contype = 'p'
  ) THEN
    ALTER TABLE public.user_purchases
      ADD CONSTRAINT user_purchases_pkey PRIMARY KEY (id);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'user_purchases_item_id_fkey'
      AND conrelid = 'public.user_purchases'::regclass
  ) THEN
    ALTER TABLE public.user_purchases
      ADD CONSTRAINT user_purchases_item_id_fkey
      FOREIGN KEY (item_id)
      REFERENCES public.shop_items(id)
      ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'user_purchases_user_id_fkey'
      AND conrelid = 'public.user_purchases'::regclass
  ) THEN
    ALTER TABLE public.user_purchases
      ADD CONSTRAINT user_purchases_user_id_fkey
      FOREIGN KEY (user_id)
      REFERENCES public.profiles(id)
      ON DELETE CASCADE;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';