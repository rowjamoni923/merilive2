-- Fix: Allow both authenticated and anonymous users to insert error logs
DROP POLICY IF EXISTS "Authenticated users can log errors" ON public.system_error_logs;

CREATE POLICY "Anyone can log errors"
ON public.system_error_logs
FOR INSERT
WITH CHECK (true);
