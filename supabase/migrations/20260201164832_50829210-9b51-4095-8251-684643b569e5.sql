-- Drop existing UPDATE policy
DROP POLICY IF EXISTS "Users can update their own reels" ON public.reels;

-- Create proper UPDATE policy with WITH CHECK
CREATE POLICY "Users can update their own reels" 
ON public.reels 
FOR UPDATE 
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Add policy for users to see their own reels (even if not approved)
DROP POLICY IF EXISTS "Users can view own reels" ON public.reels;
CREATE POLICY "Users can view own reels" 
ON public.reels 
FOR SELECT 
USING (auth.uid() = user_id);