-- Allow authenticated users to insert their own moderation logs (auto-detection)
DROP POLICY IF EXISTS "Only admins can insert moderation logs" ON public.chat_moderation_logs;

CREATE POLICY "Authenticated users can insert moderation logs"
ON public.chat_moderation_logs
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id OR is_admin(auth.uid()));

-- Also allow authenticated users to view their own violations
CREATE POLICY "Users can view own moderation logs"
ON public.chat_moderation_logs
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Check host_contact_violations RLS too
-- Allow authenticated hosts to insert their own violations
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'host_contact_violations' AND policyname = 'Authenticated can insert own violations'
  ) THEN
    EXECUTE 'CREATE POLICY "Authenticated can insert own violations" ON public.host_contact_violations FOR INSERT TO authenticated WITH CHECK (auth.uid() = host_id)';
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'host_contact_violations' AND policyname = 'Authenticated can view own violations'
  ) THEN
    EXECUTE 'CREATE POLICY "Authenticated can view own violations" ON public.host_contact_violations FOR SELECT TO authenticated USING (auth.uid() = host_id OR is_admin(auth.uid()))';
  END IF;
END
$$;