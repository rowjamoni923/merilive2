-- Allow hosts to update participants in their rooms (for seat approval)
CREATE POLICY "Hosts can update participants in their rooms"
ON public.party_room_participants
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.party_rooms
    WHERE id = party_room_participants.room_id
    AND host_id = auth.uid()
    AND is_active = true
  )
);