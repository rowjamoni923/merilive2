-- Pkg139: Allow hosts to read their own stream_recordings rows so the
-- "My Recordings" page (Pkg111/Pkg126/Pkg129) can list them.
DROP POLICY IF EXISTS "Hosts read own recordings" ON public.stream_recordings;
CREATE POLICY "Hosts read own recordings"
ON public.stream_recordings FOR SELECT
TO authenticated
USING (host_id = auth.uid());