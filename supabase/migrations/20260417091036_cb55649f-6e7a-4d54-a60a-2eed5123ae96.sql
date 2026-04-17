-- ============================================================
-- 1. STORAGE: Remove overly-broad blanket upload policies
-- ============================================================
DROP POLICY IF EXISTS "Authenticated users can upload to public buckets" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload to level-assets" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete from level-assets" ON storage.objects;

DROP POLICY IF EXISTS "Authenticated users can upload channel logos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update channel logos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete channel logos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload media files" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update media files" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete media files" ON storage.objects;

-- Replace any older admin-only policies with fresh, consistent ones
DROP POLICY IF EXISTS "Admin only insert channel-logos" ON storage.objects;
DROP POLICY IF EXISTS "Admin only update channel-logos" ON storage.objects;
DROP POLICY IF EXISTS "Admin only delete channel-logos" ON storage.objects;
DROP POLICY IF EXISTS "Admin only insert media-files" ON storage.objects;
DROP POLICY IF EXISTS "Admin only update media-files" ON storage.objects;
DROP POLICY IF EXISTS "Admin only delete media-files" ON storage.objects;

CREATE POLICY "Admin only insert channel-logos"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'channel-logos' AND public.is_admin(auth.uid()));

CREATE POLICY "Admin only update channel-logos"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'channel-logos' AND public.is_admin(auth.uid()));

CREATE POLICY "Admin only delete channel-logos"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'channel-logos' AND public.is_admin(auth.uid()));

CREATE POLICY "Admin only insert media-files"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'media-files' AND public.is_admin(auth.uid()));

CREATE POLICY "Admin only update media-files"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'media-files' AND public.is_admin(auth.uid()));

CREATE POLICY "Admin only delete media-files"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'media-files' AND public.is_admin(auth.uid()));

-- ============================================================
-- 2. REALTIME: Restrict channel subscription
-- ============================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='realtime' AND c.relname='messages') THEN
    EXECUTE 'ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "Authenticated channel access" ON realtime.messages';

    EXECUTE $POL$
      CREATE POLICY "Authenticated channel access"
      ON realtime.messages FOR SELECT
      TO authenticated
      USING (
        public.is_admin(auth.uid())
        OR topic LIKE 'room:%'
        OR topic LIKE 'public:%'
        OR topic LIKE 'leaderboard:%'
        OR topic LIKE 'broadcast:%'
        OR topic LIKE ('user:' || auth.uid()::text || '%')
        OR topic = ('user:' || auth.uid()::text)
      )
    $POL$;
  END IF;
END $$;

-- ============================================================
-- 3. POSTER IMAGES: Privacy fix
-- ============================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='poster_images') THEN
    EXECUTE 'DROP POLICY IF EXISTS "read_poster_images" ON public.poster_images';
    EXECUTE 'DROP POLICY IF EXISTS "Users see own poster images" ON public.poster_images';
    EXECUTE 'DROP POLICY IF EXISTS "Admins see all poster images" ON public.poster_images';
    EXECUTE 'CREATE POLICY "Users see own poster images" ON public.poster_images FOR SELECT TO authenticated USING (auth.uid() = user_id)';
    EXECUTE 'CREATE POLICY "Admins see all poster images" ON public.poster_images FOR SELECT TO authenticated USING (public.is_admin(auth.uid()))';
  END IF;
END $$;