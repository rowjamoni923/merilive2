
-- Allow any device to register its push token (even without login)
DROP POLICY IF EXISTS "Users can insert their own device tokens" ON public.device_tokens;
CREATE POLICY "Anyone can register device token" 
  ON public.device_tokens FOR INSERT 
  WITH CHECK (true);

-- Allow upsert (update) for token registration
DROP POLICY IF EXISTS "Users can update their own device tokens" ON public.device_tokens;
CREATE POLICY "Users can update own or anonymous tokens" 
  ON public.device_tokens FOR UPDATE 
  USING (user_id IS NULL OR auth.uid() = user_id);
