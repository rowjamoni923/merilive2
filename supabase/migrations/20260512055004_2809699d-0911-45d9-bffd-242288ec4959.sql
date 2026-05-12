DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'stream_viewers'
      AND policyname = 'Users can enter active live streams'
  ) THEN
    CREATE POLICY "Users can enter active live streams"
    ON public.stream_viewers
    FOR INSERT
    TO authenticated
    WITH CHECK (
      viewer_id = auth.uid()
      AND EXISTS (
        SELECT 1
        FROM public.live_streams ls
        WHERE ls.id = stream_viewers.stream_id
          AND COALESCE(ls.is_active, true) = true
      )
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'stream_viewers'
      AND policyname = 'Users can update own live stream presence'
  ) THEN
    CREATE POLICY "Users can update own live stream presence"
    ON public.stream_viewers
    FOR UPDATE
    TO authenticated
    USING (viewer_id = auth.uid())
    WITH CHECK (viewer_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'stream_viewers'
      AND policyname = 'Users can delete own live stream presence'
  ) THEN
    CREATE POLICY "Users can delete own live stream presence"
    ON public.stream_viewers
    FOR DELETE
    TO authenticated
    USING (viewer_id = auth.uid());
  END IF;
END $$;