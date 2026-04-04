-- Allow authenticated users to insert roulette sessions
CREATE POLICY "Authenticated users can create roulette sessions"
ON public.roulette_sessions
FOR INSERT
TO authenticated
WITH CHECK (true);

-- Allow authenticated users to update roulette sessions
CREATE POLICY "Authenticated users can update roulette sessions"
ON public.roulette_sessions
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);