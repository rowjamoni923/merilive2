-- Fix missing RLS permissions that caused live comments, live host actions,
-- and party creation/settings buttons to fail for normal authenticated users.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'stream_chat'
      AND policyname = 'Users can send chat to active streams'
  ) THEN
    CREATE POLICY "Users can send chat to active streams"
    ON public.stream_chat
    FOR INSERT
    TO authenticated
    WITH CHECK (
      user_id = auth.uid()
      AND EXISTS (
        SELECT 1
        FROM public.live_streams ls
        WHERE ls.id = stream_chat.stream_id
          AND COALESCE(ls.is_active, true) = true
      )
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'live_streams'
      AND policyname = 'Hosts can update their own live streams'
  ) THEN
    CREATE POLICY "Hosts can update their own live streams"
    ON public.live_streams
    FOR UPDATE
    TO authenticated
    USING (host_id = auth.uid())
    WITH CHECK (host_id = auth.uid());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'party_rooms'
      AND policyname = 'Users can create their own party rooms'
  ) THEN
    CREATE POLICY "Users can create their own party rooms"
    ON public.party_rooms
    FOR INSERT
    TO authenticated
    WITH CHECK (host_id = auth.uid());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'party_rooms'
      AND policyname = 'Hosts can update their own party rooms'
  ) THEN
    CREATE POLICY "Hosts can update their own party rooms"
    ON public.party_rooms
    FOR UPDATE
    TO authenticated
    USING (host_id = auth.uid())
    WITH CHECK (host_id = auth.uid());
  END IF;
END $$;