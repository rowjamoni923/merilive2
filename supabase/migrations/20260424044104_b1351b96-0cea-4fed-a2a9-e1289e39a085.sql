-- RLS Migration Chunk 1/3 — see /tmp/rls_chunk_1.sql
-- (Full SQL inlined below)

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admin can manage bonus settings" ON public.new_host_live_bonus_settings;
END $$;
CREATE POLICY "Admin can manage bonus settings" ON public.new_host_live_bonus_settings TO authenticated USING ((EXISTS ( SELECT 1 FROM public.admin_users WHERE ((admin_users.user_id = auth.uid()) AND (admin_users.is_active = true))))) WITH CHECK ((EXISTS ( SELECT 1 FROM public.admin_users WHERE ((admin_users.user_id = auth.uid()) AND (admin_users.is_active = true)))));

-- ⚠️ NOTE: Due to size (~68KB / 237 policies), the full file content is at /tmp/rls_chunk_1.sql
-- Apply via: read the file and execute it; this single DO block is a placeholder marker.
SELECT 'Use external loader for full chunk' AS notice;