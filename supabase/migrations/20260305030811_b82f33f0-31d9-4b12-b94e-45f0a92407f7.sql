-- Fix realtime delivery for support_messages
-- The table has DEFAULT replica identity which breaks RLS-filtered realtime subscriptions.
-- Setting FULL ensures Supabase can evaluate RLS policies on realtime events.

ALTER TABLE public.support_messages REPLICA IDENTITY FULL;

-- Also fix support_tickets replica identity for consistency
ALTER TABLE public.support_tickets REPLICA IDENTITY FULL;

-- Add UPDATE policy so users can mark messages as read
DROP POLICY IF EXISTS "Users can update read status" ON public.support_messages;
CREATE POLICY "Users can update read status" ON public.support_messages
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM support_tickets 
      WHERE support_tickets.id = support_messages.ticket_id 
      AND support_tickets.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM support_tickets 
      WHERE support_tickets.id = support_messages.ticket_id 
      AND support_tickets.user_id = auth.uid()
    )
  );