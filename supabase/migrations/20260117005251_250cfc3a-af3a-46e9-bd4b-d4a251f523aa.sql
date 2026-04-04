-- Fix RLS policies for realtime to work
-- Ensure users can see their own calls (as caller or host)
DROP POLICY IF EXISTS "Users can see their own calls" ON private_calls;
CREATE POLICY "Users can see their own calls" ON private_calls
FOR SELECT USING (auth.uid() = caller_id OR auth.uid() = host_id);

-- Ensure hosts can update calls they receive
DROP POLICY IF EXISTS "Hosts can update their calls" ON private_calls;
CREATE POLICY "Hosts can update their calls" ON private_calls
FOR UPDATE USING (auth.uid() = host_id OR auth.uid() = caller_id);