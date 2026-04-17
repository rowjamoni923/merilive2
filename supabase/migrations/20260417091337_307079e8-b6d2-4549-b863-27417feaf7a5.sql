DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='realtime' AND c.relname='messages') THEN
    EXECUTE 'DROP POLICY IF EXISTS "Authenticated channel access" ON realtime.messages';
    EXECUTE $POL$
      CREATE POLICY "Authenticated channel access"
      ON realtime.messages FOR SELECT TO authenticated
      USING (
        public.is_admin(auth.uid())
        OR topic LIKE ('user:' || auth.uid()::text || '%')
        OR topic = ('user:' || auth.uid()::text)
        OR topic LIKE 'public:%'
        OR topic LIKE 'leaderboard:%'
        OR (
          topic LIKE 'room:%'
          AND (
            EXISTS (
              SELECT 1 FROM public.party_room_participants p
              WHERE p.user_id = auth.uid()
                AND ('room:' || p.room_id::text) = topic
            )
            OR EXISTS (
              SELECT 1 FROM public.stream_viewers v
              WHERE v.viewer_id = auth.uid()
                AND ('room:' || v.stream_id::text) = topic
            )
          )
        )
      )
    $POL$;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.is_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admin_users au
    WHERE au.user_id = _user_id AND au.is_active = true
  );
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='admin_notices') THEN
    EXECUTE 'DROP POLICY IF EXISTS "public_read" ON public.admin_notices';
    EXECUTE 'DROP POLICY IF EXISTS "Admin only read notices" ON public.admin_notices';
    EXECUTE 'CREATE POLICY "Admin only read notices" ON public.admin_notices FOR SELECT TO authenticated USING (public.is_admin(auth.uid()))';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='live_bans') THEN
    EXECUTE 'DROP POLICY IF EXISTS "a_read_live_bans" ON public.live_bans';
    EXECUTE 'DROP POLICY IF EXISTS "Users see own bans" ON public.live_bans';
    EXECUTE 'DROP POLICY IF EXISTS "Admins see all bans" ON public.live_bans';
    EXECUTE 'CREATE POLICY "Users see own bans" ON public.live_bans FOR SELECT TO authenticated USING (auth.uid() = user_id)';
    EXECUTE 'CREATE POLICY "Admins see all bans" ON public.live_bans FOR SELECT TO authenticated USING (public.is_admin(auth.uid()))';
  END IF;
END $$;