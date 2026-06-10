DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.conversations'::regclass AND contype='p') THEN
    ALTER TABLE public.conversations ADD CONSTRAINT conversations_pkey PRIMARY KEY (id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.messages'::regclass AND contype='p') THEN
    ALTER TABLE public.messages ADD CONSTRAINT messages_pkey PRIMARY KEY (id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.gift_categories'::regclass AND contype='p') THEN
    ALTER TABLE public.gift_categories ADD CONSTRAINT gift_categories_pkey PRIMARY KEY (id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.user_vip_subscriptions'::regclass AND contype='p') THEN
    ALTER TABLE public.user_vip_subscriptions ADD CONSTRAINT user_vip_subscriptions_pkey PRIMARY KEY (id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='conversations_participant1_id_fkey' AND conrelid='public.conversations'::regclass) THEN
    ALTER TABLE public.conversations ADD CONSTRAINT conversations_participant1_id_fkey FOREIGN KEY (participant1_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='conversations_participant2_id_fkey' AND conrelid='public.conversations'::regclass) THEN
    ALTER TABLE public.conversations ADD CONSTRAINT conversations_participant2_id_fkey FOREIGN KEY (participant2_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='messages_conversation_id_fkey' AND conrelid='public.messages'::regclass) THEN
    ALTER TABLE public.messages ADD CONSTRAINT messages_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='messages_sender_id_fkey' AND conrelid='public.messages'::regclass) THEN
    ALTER TABLE public.messages ADD CONSTRAINT messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='user_vip_subscriptions_user_id_fkey' AND conrelid='public.user_vip_subscriptions'::regclass) THEN
    ALTER TABLE public.user_vip_subscriptions ADD CONSTRAINT user_vip_subscriptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='user_vip_subscriptions_vip_tier_id_fkey' AND conrelid='public.user_vip_subscriptions'::regclass) THEN
    ALTER TABLE public.user_vip_subscriptions ADD CONSTRAINT user_vip_subscriptions_vip_tier_id_fkey FOREIGN KEY (vip_tier_id) REFERENCES public.vip_tiers(id) ON DELETE CASCADE;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';