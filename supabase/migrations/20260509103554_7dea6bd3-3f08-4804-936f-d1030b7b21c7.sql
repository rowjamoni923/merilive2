
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.payment_gateways'::regclass AND contype='p') THEN
    ALTER TABLE public.payment_gateways ADD CONSTRAINT payment_gateways_pkey PRIMARY KEY (id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='helper_orders_user_id_fkey') THEN
    ALTER TABLE public.helper_orders
      ADD CONSTRAINT helper_orders_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='payment_transactions_user_id_fkey') THEN
    ALTER TABLE public.payment_transactions
      ADD CONSTRAINT payment_transactions_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='payment_transactions_gateway_id_fkey') THEN
    ALTER TABLE public.payment_transactions
      ADD CONSTRAINT payment_transactions_gateway_id_fkey
      FOREIGN KEY (gateway_id) REFERENCES public.payment_gateways(id) ON DELETE SET NULL NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='user_role_frames_user_id_fkey') THEN
    ALTER TABLE public.user_role_frames
      ADD CONSTRAINT user_role_frames_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE NOT VALID;
  END IF;
END$$;

NOTIFY pgrst, 'reload schema';
