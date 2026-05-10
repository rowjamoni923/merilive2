
-- Fix system_error_logs RLS so anon/authenticated/service can insert error logs
ALTER TABLE public.system_error_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can insert error logs" ON public.system_error_logs;
CREATE POLICY "Anyone can insert error logs"
ON public.system_error_logs
FOR INSERT
TO anon, authenticated, service_role
WITH CHECK (true);
