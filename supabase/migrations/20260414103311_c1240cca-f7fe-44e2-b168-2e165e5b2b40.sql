-- 1) Make chat-media bucket public so gift icon URLs work
UPDATE storage.buckets SET public = true WHERE id = 'chat-media';

-- 2) Add SELECT policy for chat-media storage (public read)
DO $$ BEGIN
  DROP POLICY IF EXISTS "public_read_chat-media" ON storage.objects;
EXCEPTION WHEN others THEN NULL; END $$;

CREATE POLICY "public_read_chat-media" ON storage.objects
FOR SELECT USING (bucket_id = 'chat-media');

-- 3) Add INSERT policy for conversations
DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can create conversations" ON public.conversations;
EXCEPTION WHEN others THEN NULL; END $$;

CREATE POLICY "Users can create conversations" ON public.conversations
FOR INSERT TO authenticated
WITH CHECK (auth.uid() = participant1_id OR auth.uid() = participant2_id);

-- 4) Add UPDATE policy for conversations
DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can update own conversations" ON public.conversations;
EXCEPTION WHEN others THEN NULL; END $$;

CREATE POLICY "Users can update own conversations" ON public.conversations
FOR UPDATE TO authenticated
USING (auth.uid() = participant1_id OR auth.uid() = participant2_id);

-- 5) Add INSERT policy for messages
DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can send messages" ON public.messages;
EXCEPTION WHEN others THEN NULL; END $$;

CREATE POLICY "Users can send messages" ON public.messages
FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = sender_id 
  AND is_conversation_participant(auth.uid(), conversation_id)
);

-- 6) Add UPDATE policy for messages (mark read, soft delete)
DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can update messages in their conversations" ON public.messages;
EXCEPTION WHEN others THEN NULL; END $$;

CREATE POLICY "Users can update messages in their conversations" ON public.messages
FOR UPDATE TO authenticated
USING (is_conversation_participant(auth.uid(), conversation_id));