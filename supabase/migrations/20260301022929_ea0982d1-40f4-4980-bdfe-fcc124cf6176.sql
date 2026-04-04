-- FIX CRITICAL: device_tokens table wide open to anonymous users
-- Users should only see/modify their own device tokens

-- Drop overly permissive policies
DROP POLICY IF EXISTS "device_tokens_select" ON public.device_tokens;
DROP POLICY IF EXISTS "device_tokens_insert" ON public.device_tokens;
DROP POLICY IF EXISTS "device_tokens_update" ON public.device_tokens;
DROP POLICY IF EXISTS "device_tokens_delete" ON public.device_tokens;

-- Recreate with proper restrictions
-- SELECT: Users can only see their own tokens
CREATE POLICY "device_tokens_select" ON public.device_tokens
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- INSERT: Users can only insert tokens for themselves
CREATE POLICY "device_tokens_insert" ON public.device_tokens
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- UPDATE: Users can only update their own tokens
CREATE POLICY "device_tokens_update" ON public.device_tokens
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- DELETE: Users can only delete their own tokens (keep existing logic for null user_id)
CREATE POLICY "device_tokens_delete" ON public.device_tokens
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);
