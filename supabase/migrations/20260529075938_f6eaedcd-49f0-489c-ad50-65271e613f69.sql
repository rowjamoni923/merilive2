CREATE POLICY "Viewers can see ended live stream they joined"
ON public.live_streams
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.stream_viewers sv
    WHERE sv.stream_id = live_streams.id
      AND sv.viewer_id = auth.uid()
  )
);

CREATE POLICY "Participants can see ended party room they joined"
ON public.party_rooms
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.party_room_participants prp
    WHERE prp.room_id = party_rooms.id
      AND prp.user_id = auth.uid()
  )
);