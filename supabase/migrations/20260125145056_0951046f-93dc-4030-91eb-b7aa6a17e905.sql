-- Create party_room_messages table for Party Room chat (separate from live_streams)
CREATE TABLE IF NOT EXISTS public.party_room_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  room_id UUID NOT NULL REFERENCES public.party_rooms(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  message_type TEXT DEFAULT 'chat',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.party_room_messages ENABLE ROW LEVEL SECURITY;

-- RLS policies: Anyone in the room can see messages
CREATE POLICY "Participants can view room messages"
ON public.party_room_messages
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.party_room_participants 
    WHERE room_id = party_room_messages.room_id 
    AND user_id = auth.uid()
    AND left_at IS NULL
  )
  OR
  EXISTS (
    SELECT 1 FROM public.party_rooms 
    WHERE id = party_room_messages.room_id 
    AND host_id = auth.uid()
  )
);

-- Anyone authenticated can send messages to rooms they're in
CREATE POLICY "Authenticated users can send messages"
ON public.party_room_messages
FOR INSERT
WITH CHECK (
  auth.uid() = sender_id
  AND (
    EXISTS (
      SELECT 1 FROM public.party_room_participants 
      WHERE room_id = party_room_messages.room_id 
      AND user_id = auth.uid()
      AND left_at IS NULL
    )
    OR
    EXISTS (
      SELECT 1 FROM public.party_rooms 
      WHERE id = party_room_messages.room_id 
      AND host_id = auth.uid()
    )
  )
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_party_room_messages_room_id ON public.party_room_messages(room_id);
CREATE INDEX IF NOT EXISTS idx_party_room_messages_created_at ON public.party_room_messages(created_at DESC);

-- Enable realtime for party_room_messages
ALTER PUBLICATION supabase_realtime ADD TABLE party_room_messages;