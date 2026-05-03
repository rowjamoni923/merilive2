-- Add missing FKs on gift_transactions so PostgREST embeds work for admin pages.
-- sender_id already has gift_transactions_sender_id_fkey; receiver_id and gift_id are missing.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'gift_transactions_receiver_id_fkey'
  ) THEN
    ALTER TABLE public.gift_transactions
      ADD CONSTRAINT gift_transactions_receiver_id_fkey
      FOREIGN KEY (receiver_id) REFERENCES public.profiles(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'gift_transactions_gift_id_fkey'
  ) THEN
    ALTER TABLE public.gift_transactions
      ADD CONSTRAINT gift_transactions_gift_id_fkey
      FOREIGN KEY (gift_id) REFERENCES public.gifts(id) ON DELETE SET NULL;
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_gift_transactions_receiver_id ON public.gift_transactions(receiver_id);
CREATE INDEX IF NOT EXISTS idx_gift_transactions_gift_id ON public.gift_transactions(gift_id);
